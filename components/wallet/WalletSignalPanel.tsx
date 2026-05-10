"use client";

import type { HeldToken } from "./PortfolioGrid";
import { humanizeNumber } from "@/lib/utils";

/**
 * The wallet's one-line verdict + signal pills, computed from data we
 * already fetched (held tokens + empty-account count). Same severity
 * scheme as the token SignalPanel — keeps the visual language consistent
 * across product surfaces. Zero AI tokens, all rule-based.
 *
 * What it tells you in 2 seconds:
 *   - Vibe (whale / mid-cap holder / dust collector / fresh wallet)
 *   - Day's trajectory across the portfolio
 *   - Concentration risk
 *   - Recoverable SOL hint when there's clutter to clean up
 *
 * The verdict line is the first thing the user reads when they connect.
 */
export function WalletSignalPanel({
  held,
  emptyCount,
}: {
  held: HeldToken[];
  emptyCount: number;
}) {
  const stats = computeStats(held, emptyCount);
  const signals = composeSignals(stats);
  const verdict = composeVerdict(stats, signals);

  return (
    <div className="glass rounded-2xl p-5 sm:p-6 mb-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[10px] uppercase tracking-[0.2em] text-text-muted font-bold">
          Wallet pulse
        </h3>
        <span className="text-[9.5px] uppercase tracking-[0.18em] text-text-muted">
          {stats.tokenCount} positions · ${humanizeNumber(stats.totalValue)}
        </span>
      </div>

      <p
        className="text-[15px] sm:text-[17px] font-semibold leading-snug mb-4 tracking-tight"
        style={{ color: verdict.color }}
      >
        {verdict.text}
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <Stat label="Holdings" value={`${stats.tokenCount}`} sublabel="tokens" />
        <Stat
          label="Total value"
          value={`$${humanizeNumber(stats.totalValue)}`}
          sublabel="approx"
        />
        <Stat
          label="24h"
          value={`${stats.weightedChange24h >= 0 ? "+" : ""}${stats.weightedChange24h.toFixed(1)}%`}
          sublabel="weighted"
          color={
            stats.weightedChange24h > 0
              ? "#0a8f57"
              : stats.weightedChange24h < 0
                ? "#c1374a"
                : undefined
          }
        />
        <Stat
          label="Dust"
          value={`${emptyCount}`}
          sublabel="dead accounts"
          color={emptyCount > 8 ? "#d6601a" : emptyCount > 0 ? "#0a6f47" : undefined}
        />
      </div>

      {signals.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {signals.map((s, i) => (
            <SignalPill key={i} signal={s} />
          ))}
        </div>
      )}
    </div>
  );
}

type WalletStats = {
  tokenCount: number;
  totalValue: number;
  weightedChange24h: number; // value-weighted across positions with price data
  topConcentrationPct: number; // % of total value in top holding
  top3ConcentrationPct: number; // % in top 3
  greenCount: number; // tokens up 24h
  redCount: number; // tokens down 24h
  bagCount: number; // tokens with no price (probably dust / illiquid)
  emptyCount: number;
};

function computeStats(held: HeldToken[], emptyCount: number): WalletStats {
  const valued = held.filter((h) => (h.value_usd ?? 0) > 0);
  const total = valued.reduce((s, h) => s + (h.value_usd ?? 0), 0);

  // Value-weighted 24h change. Tokens without price data don't pull the average.
  const weightedNum = valued.reduce(
    (s, h) => s + (h.price_change_24h ?? 0) * (h.value_usd ?? 0),
    0,
  );
  const weightedChange24h = total > 0 ? weightedNum / total : 0;

  const sortedByValue = [...valued].sort(
    (a, b) => (b.value_usd ?? 0) - (a.value_usd ?? 0),
  );
  const topVal = sortedByValue[0]?.value_usd ?? 0;
  const top3 = sortedByValue.slice(0, 3).reduce((s, h) => s + (h.value_usd ?? 0), 0);

  return {
    tokenCount: held.length,
    totalValue: total,
    weightedChange24h,
    topConcentrationPct: total > 0 ? (topVal / total) * 100 : 0,
    top3ConcentrationPct: total > 0 ? (top3 / total) * 100 : 0,
    greenCount: valued.filter((h) => (h.price_change_24h ?? 0) > 0).length,
    redCount: valued.filter((h) => (h.price_change_24h ?? 0) < 0).length,
    bagCount: held.length - valued.length,
    emptyCount,
  };
}

type Severity = "good" | "neutral" | "warn" | "bad";
type Signal = { label: string; value: string; severity: Severity; weight: number };

function composeSignals(s: WalletStats): Signal[] {
  const out: Signal[] = [];

  if (s.totalValue >= 250_000) {
    out.push({ label: "Whale", value: `$${humanizeNumber(s.totalValue)}`, severity: "good", weight: 6 });
  } else if (s.totalValue >= 50_000) {
    out.push({ label: "Mid-cap holder", value: `$${humanizeNumber(s.totalValue)}`, severity: "good", weight: 4 });
  } else if (s.totalValue >= 5_000) {
    out.push({ label: "Active wallet", value: `$${humanizeNumber(s.totalValue)}`, severity: "neutral", weight: 2 });
  } else if (s.totalValue > 0) {
    out.push({ label: "Light bags", value: `$${humanizeNumber(s.totalValue)}`, severity: "neutral", weight: 1 });
  }

  if (s.topConcentrationPct > 70) {
    out.push({
      label: "Concentrated bet",
      value: `${s.topConcentrationPct.toFixed(0)}% in 1 token`,
      severity: "warn",
      weight: 5,
    });
  } else if (s.top3ConcentrationPct > 80) {
    out.push({
      label: "Heavy top-3",
      value: `${s.top3ConcentrationPct.toFixed(0)}% in 3`,
      severity: "warn",
      weight: 3,
    });
  } else if (s.tokenCount >= 12) {
    out.push({
      label: "Diversified",
      value: `${s.tokenCount} positions`,
      severity: "good",
      weight: 2,
    });
  }

  if (s.greenCount + s.redCount > 0) {
    if (s.greenCount > s.redCount * 2) {
      out.push({
        label: "Mostly green",
        value: `${s.greenCount}↑ / ${s.redCount}↓`,
        severity: "good",
        weight: 3,
      });
    } else if (s.redCount > s.greenCount * 2) {
      out.push({
        label: "Mostly red",
        value: `${s.greenCount}↑ / ${s.redCount}↓`,
        severity: "warn",
        weight: 3,
      });
    } else {
      out.push({
        label: "Mixed day",
        value: `${s.greenCount}↑ / ${s.redCount}↓`,
        severity: "neutral",
        weight: 1,
      });
    }
  }

  if (s.bagCount >= 5) {
    out.push({
      label: "Stuck bags",
      value: `${s.bagCount} illiquid`,
      severity: "bad",
      weight: 4,
    });
  } else if (s.bagCount > 0) {
    out.push({
      label: "Some dead weight",
      value: `${s.bagCount} illiquid`,
      severity: "warn",
      weight: 2,
    });
  }

  if (s.emptyCount >= 10) {
    out.push({
      label: "Reclaimable SOL",
      value: `${s.emptyCount} empty acc`,
      severity: "good",
      weight: 5,
    });
  } else if (s.emptyCount > 0) {
    out.push({
      label: "Cleanup pending",
      value: `${s.emptyCount} empty acc`,
      severity: "neutral",
      weight: 2,
    });
  }

  return out;
}

function composeVerdict(s: WalletStats, signals: Signal[]): { text: string; color: string } {
  if (s.tokenCount === 0) {
    return {
      text: "Empty wallet — nothing held, nothing to read.",
      color: "#4a4a5e",
    };
  }
  if (s.totalValue === 0 && s.bagCount > 0) {
    return {
      text: `${s.bagCount} bags, no liquid value left — bear with us, you might still reclaim rent.`,
      color: "#d6601a",
    };
  }

  // Headline phrase: pick the loudest signal label.
  const top = [...signals].sort((a, b) => b.weight - a.weight)[0];
  const dayDir =
    s.weightedChange24h > 4
      ? "ripping"
      : s.weightedChange24h > 1
        ? "drifting up"
        : s.weightedChange24h < -4
          ? "bleeding"
          : s.weightedChange24h < -1
            ? "drifting down"
            : "flat";
  const dayColor =
    s.weightedChange24h > 1
      ? "#0a8f57"
      : s.weightedChange24h < -1
        ? "#c1374a"
        : "#4a4a5e";

  if (!top) {
    return {
      text: `${s.tokenCount} positions, ${dayDir} on the day.`,
      color: dayColor,
    };
  }

  // Personalize a few high-signal cases.
  if (top.label === "Whale") {
    return {
      text: `Whale wallet — $${humanizeNumber(s.totalValue)} across ${s.tokenCount} positions, ${dayDir}.`,
      color: dayColor,
    };
  }
  if (top.label === "Concentrated bet") {
    return {
      text: `${s.topConcentrationPct.toFixed(0)}% in one bag — high conviction or just stuck. ${dayDir.charAt(0).toUpperCase() + dayDir.slice(1)} today.`,
      color: dayColor,
    };
  }
  if (top.label === "Mid-cap holder") {
    return {
      text: `Mid-cap holder, ${s.tokenCount} positions, portfolio ${dayDir}.`,
      color: dayColor,
    };
  }
  if (top.label === "Reclaimable SOL") {
    return {
      text: `${s.emptyCount} dead accounts — there's SOL to reclaim. Check the Hidden SOL tab.`,
      color: "#0a8f57",
    };
  }
  if (top.label === "Stuck bags") {
    return {
      text: `${s.bagCount} illiquid bags weighing this wallet down — ${dayDir}.`,
      color: "#d6601a",
    };
  }
  return {
    text: `${top.label} · ${s.tokenCount} positions, ${dayDir}.`,
    color: dayColor,
  };
}

function Stat({
  label,
  value,
  sublabel,
  color,
}: {
  label: string;
  value: string;
  sublabel?: string;
  color?: string;
}) {
  return (
    <div>
      <div className="text-[9.5px] uppercase tracking-[0.18em] text-text-muted font-bold">
        {label}
      </div>
      <div
        className="text-[18px] sm:text-[20px] leading-tight font-semibold text-mono mt-0.5"
        style={color ? { color } : undefined}
      >
        {value}
      </div>
      {sublabel && (
        <div className="text-[10px] text-text-muted mt-0.5">{sublabel}</div>
      )}
    </div>
  );
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
