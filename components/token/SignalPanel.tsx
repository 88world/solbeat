import type { TokenAnalysis } from "@/types/token";

/**
 * Proprietary signal panel — the "smart synthesis" combining every data
 * source into a single one-line verdict + the underlying signals.
 *
 * Inputs we already have on every token, free:
 *   - 24h buys vs sells (DexScreener) → buy pressure
 *   - top-10 holder concentration (Helius getTokenLargestAccounts) → whale risk
 *   - mint/freeze authority (public RPC getAccountInfo) → supply control risk
 *   - 24h volume vs liquidity ratio → wash-trade signal
 *   - pool age → trust runway
 *   - tweet engagement totals → social heat
 *
 * The panel composes these into named signal pills + a one-line verdict.
 * Zero AI tokens spent — pure rule-based logic on data we already fetch.
 */
export function SignalPanel({ analysis }: { analysis: TokenAnalysis }) {
  const signals = computeSignals(analysis);
  const verdict = composeVerdict(signals);

  return (
    <div className="glass rounded-2xl p-5 sm:p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[10px] uppercase tracking-[0.2em] text-text-muted font-bold">
          Signal
        </h3>
        <span className="text-[9.5px] uppercase tracking-[0.18em] text-text-muted">
          on-chain + social
        </span>
      </div>

      <p
        className="text-[14px] sm:text-[15px] font-semibold leading-snug mb-4"
        style={{ color: verdict.color }}
      >
        {verdict.text}
      </p>

      <div className="flex flex-wrap gap-1.5">
        {signals.map((s, i) => (
          <SignalPill key={i} signal={s} />
        ))}
      </div>
    </div>
  );
}

type Severity = "good" | "neutral" | "warn" | "bad";
type Signal = {
  label: string;
  value: string;
  severity: Severity;
  /** Lower = lower-priority for verdict composition. */
  weight: number;
};

function computeSignals(a: TokenAnalysis): Signal[] {
  const s: Signal[] = [];

  // Buy/sell pressure (we don't have this on TokenAnalysis directly — would
  // need Wire txns through orchestrator; for now skip if absent).
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

  // Social heat
  const tweetEngagement = a.tweets.reduce((acc, t) => acc + t.engagement, 0);
  if (tweetEngagement > 50_000) {
    s.push({ label: "Viral on X", value: `${formatK(tweetEngagement)} engagement`, severity: "good", weight: 4 });
  } else if (tweetEngagement > 5_000) {
    s.push({ label: "Trending on X", value: `${formatK(tweetEngagement)} engagement`, severity: "good", weight: 2 });
  } else if (a.tweets.length === 0) {
    s.push({ label: "Quiet socially", value: "no recent posts", severity: "neutral", weight: 1 });
  }

  return s;
}

function composeVerdict(signals: Signal[]): { text: string; color: string } {
  if (signals.length === 0) {
    return {
      text: "Not enough data to call it.",
      color: "#4a4a5e",
    };
  }
  // Score: bad = -2, warn = -1, neutral = 0, good = +1
  let score = 0;
  let totalWeight = 0;
  for (const s of signals) {
    const v = s.severity === "good" ? 1 : s.severity === "neutral" ? 0 : s.severity === "warn" ? -1 : -2;
    score += v * s.weight;
    totalWeight += s.weight;
  }
  const avg = score / Math.max(1, totalWeight);

  // Pick the highest-weight bad/good signal as the headline phrase
  const top = [...signals].sort((a, b) => b.weight - a.weight)[0];

  if (avg < -0.6) {
    return {
      text: `${top.label.toLowerCase()} — sit on your hands.`,
      color: "#c1374a",
    };
  }
  if (avg < -0.2) {
    return {
      text: `${top.label.toLowerCase()} flagged — verify before sizing.`,
      color: "#d6601a",
    };
  }
  if (avg > 0.4) {
    return {
      text: `${top.label.toLowerCase()} — momentum is real, watch the holders.`,
      color: "#0a8f57",
    };
  }
  if (avg > 0) {
    return {
      text: `${top.label.toLowerCase()} — mixed signals, lean cautious.`,
      color: "#0a6f47",
    };
  }
  return {
    text: "Mixed read — nothing screams either direction.",
    color: "#4a4a5e",
  };
}

function SignalPill({ signal }: { signal: Signal }) {
  const styles: Record<Severity, { bg: string; color: string; ring: string }> = {
    good:    { bg: "rgba(20, 241, 149, 0.10)", color: "#0a6f47", ring: "rgba(20, 241, 149, 0.35)" },
    neutral: { bg: "rgba(10, 10, 30, 0.05)",   color: "#4a4a5e", ring: "rgba(10, 10, 30, 0.10)" },
    warn:    { bg: "rgba(214, 96, 26, 0.10)",  color: "#d6601a", ring: "rgba(214, 96, 26, 0.30)" },
    bad:     { bg: "rgba(193, 55, 74, 0.10)",  color: "#c1374a", ring: "rgba(193, 55, 74, 0.30)" },
  };
  const s = styles[signal.severity];
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10.5px] font-semibold"
      style={{
        background: s.bg,
        color: s.color,
        boxShadow: `inset 0 0 0 1px ${s.ring}`,
      }}
    >
      <span className="font-bold uppercase tracking-[0.10em] text-[9.5px]">
        {signal.label}
      </span>
      <span className="text-mono opacity-75">{signal.value}</span>
    </span>
  );
}

function formatK(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(Math.round(n));
}
