import type { TokenAnalysis } from "@/types/token";

/**
 * Pure rule-based signal composition. Extracted from SignalPanel so the
 * snapshot writer (lib/pulse/snapshots.ts) can reuse the same logic without
 * pulling React/JSX into a server module. SignalPanel re-exports these as
 * its own internals.
 */

export type Severity = "good" | "neutral" | "warn" | "bad";
export type Signal = {
  label: string;
  value: string;
  severity: Severity;
  /** Lower = lower-priority for verdict composition. */
  weight: number;
};

export function computeSignals(a: TokenAnalysis): Signal[] {
  const s: Signal[] = [];

  // Volume / liquidity ratio
  const liq = a.market.liquidity_usd ?? 0;
  const vol = a.market.volume_24h ?? 0;
  if (liq > 0 && vol > 0) {
    const vlr = vol / liq;
    if (vlr > 25) {
      s.push({ label: "Wash-trade risk", value: `${vlr.toFixed(1)}x V/L`, severity: "bad", weight: 8 });
    } else if (vlr > 12) {
      s.push({ label: "Heavy turnover", value: `${vlr.toFixed(1)}x V/L`, severity: "warn", weight: 4 });
    } else if (vlr > 4) {
      s.push({ label: "Active trading", value: `${vlr.toFixed(1)}x V/L`, severity: "good", weight: 2 });
    } else {
      s.push({ label: "Light trading", value: `${vlr.toFixed(1)}x V/L`, severity: "neutral", weight: 1 });
    }
  }

  // Authorities
  if (a.metadata.mint_authority) {
    s.push({ label: "Mint live", value: "supply not fixed", severity: "bad", weight: 9 });
  } else {
    s.push({ label: "Mint revoked", value: "supply fixed", severity: "good", weight: 3 });
  }
  if (a.metadata.freeze_authority) {
    s.push({ label: "Freeze live", value: "balances freezable", severity: "warn", weight: 7 });
  }

  // Holder concentration
  const top10 = a.holders.top_10_pct;
  if (top10 != null) {
    if (top10 > 70) {
      s.push({ label: "Whale stacked", value: `top 10 hold ${top10.toFixed(0)}%`, severity: "bad", weight: 8 });
    } else if (top10 > 45) {
      s.push({ label: "Concentrated", value: `top 10 hold ${top10.toFixed(0)}%`, severity: "warn", weight: 5 });
    } else if (top10 > 25) {
      s.push({ label: "Healthy spread", value: `top 10 hold ${top10.toFixed(0)}%`, severity: "good", weight: 2 });
    } else {
      s.push({ label: "Wide distribution", value: `top 10 hold ${top10.toFixed(0)}%`, severity: "good", weight: 3 });
    }
  }

  // Pool age
  const ageH = a.metadata.age_hours ?? a.market.pair_age_hours;
  if (ageH != null) {
    if (ageH < 24) {
      s.push({ label: "Fresh launch", value: `${Math.round(ageH)}h old`, severity: "warn", weight: 5 });
    } else if (ageH < 24 * 7) {
      s.push({ label: "Young pool", value: `${Math.round(ageH / 24)}d old`, severity: "neutral", weight: 2 });
    } else if (ageH > 24 * 30) {
      s.push({ label: "Established", value: `${Math.round(ageH / 24 / 30)}mo old`, severity: "good", weight: 2 });
    }
  }

  // 24h price move
  const ch = a.market.price_change_24h ?? 0;
  if (Math.abs(ch) > 100) {
    s.push({
      label: ch > 0 ? "Massive pump" : "Heavy dump",
      value: `${ch >= 0 ? "+" : ""}${ch.toFixed(0)}% 24h`,
      severity: ch > 0 ? "warn" : "bad",
      weight: 6,
    });
  } else if (Math.abs(ch) > 30) {
    s.push({
      label: ch > 0 ? "Pumping" : "Dumping",
      value: `${ch >= 0 ? "+" : ""}${ch.toFixed(0)}% 24h`,
      severity: ch > 0 ? "good" : "warn",
      weight: 4,
    });
  }

  // Social heat + hype-quality (bot-vs-organic).
  const tweetEngagement = a.tweets.reduce((acc, t) => acc + t.engagement, 0);
  const hype = computeHypeQuality(a.tweets);
  if (tweetEngagement > 50_000) {
    s.push({ label: "Viral on X", value: `${formatK(tweetEngagement)} engagement`, severity: "good", weight: 4 });
  } else if (tweetEngagement > 5_000) {
    s.push({ label: "Trending on X", value: `${formatK(tweetEngagement)} engagement`, severity: "good", weight: 2 });
  } else if (a.tweets.length === 0) {
    s.push({ label: "Quiet socially", value: "no recent posts", severity: "neutral", weight: 1 });
  }

  if (hype) s.push(hype);

  return s;
}

function computeHypeQuality(tweets: TokenAnalysis["tweets"]): Signal | null {
  if (tweets.length < 5) return null;
  const subKilo = tweets.filter((t) => t.followers < 1_000).length;
  const subKiloPct = (subKilo / tweets.length) * 100;
  const bigAccounts = tweets.filter(
    (t) => t.verified || t.followers >= 100_000,
  ).length;
  const totalEng = tweets.reduce((acc, t) => acc + t.engagement, 0);

  if (subKiloPct > 70 && totalEng > 1_000) {
    return {
      label: "Coordinated hype",
      value: `${subKilo}/${tweets.length} sub-1k followers`,
      severity: "bad",
      weight: 6,
    };
  }
  if (bigAccounts >= 2) {
    return {
      label: "Big accounts in",
      value: `${bigAccounts} 100k+ posters`,
      severity: "good",
      weight: 4,
    };
  }
  if (subKiloPct > 50) {
    return {
      label: "Grassroots-only",
      value: `${subKilo}/${tweets.length} small accounts`,
      severity: "warn",
      weight: 2,
    };
  }
  return null;
}

export function composeVerdict(
  signals: Signal[],
  ctx: { ageHours?: number | null; liquidity?: number | null } = {},
): {
  text: string;
  color: string;
  severity: Severity;
} {
  if (signals.length === 0) {
    return {
      text: "Not enough data to call it.",
      color: "#4a4a5e",
      severity: "neutral",
    };
  }
  let score = 0;
  let totalWeight = 0;
  for (const s of signals) {
    const v =
      s.severity === "good"
        ? 1
        : s.severity === "neutral"
          ? 0
          : s.severity === "warn"
            ? -1
            : -2;
    score += v * s.weight;
    totalWeight += s.weight;
  }
  const avg = score / Math.max(1, totalWeight);
  const top = [...signals].sort((a, b) => b.weight - a.weight)[0];
  const head = top.label.charAt(0).toUpperCase() + top.label.slice(1).toLowerCase();

  // Context-aware: ESTABLISHED tokens (>1yr, deep LP) get a softer read
  // even when the rule-based score is bad, because the bad signal is
  // usually "mint authority active" which means much less on a 3-year-old
  // token with $1M+ LP than on a fresh dev launch.
  const established =
    (ctx.ageHours ?? 0) > 24 * 365 && (ctx.liquidity ?? 0) > 500_000;

  if (avg < -0.6) {
    if (established) {
      return {
        text: `${head}, but the token has 1yr+ of clean track record. Lower practical risk than the raw flags suggest.`,
        color: "#d6601a",
        severity: "warn",
      };
    }
    return {
      text: `${head}. Sit on your hands.`,
      color: "#c1374a",
      severity: "bad",
    };
  }
  if (avg < -0.2) {
    if (established) {
      return {
        text: `${head} flagged on an established token. Verify the actor, not the flag.`,
        color: "#a3680a",
        severity: "warn",
      };
    }
    return {
      text: `${head} flagged. Verify before sizing.`,
      color: "#d6601a",
      severity: "warn",
    };
  }
  if (avg > 0.4) {
    return {
      text: `${head}. Momentum is real, watch the holders.`,
      color: "#0a8f57",
      severity: "good",
    };
  }
  if (avg > 0) {
    return {
      text: `${head}. Mixed signals, lean cautious.`,
      color: "#0a6f47",
      severity: "good",
    };
  }
  return {
    text: "Mixed read. Nothing screams either direction.",
    color: "#4a4a5e",
    severity: "neutral",
  };
}

function formatK(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(Math.round(n));
}
