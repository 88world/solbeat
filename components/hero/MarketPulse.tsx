"use client";

import { useEffect, useState } from "react";
import type { HeatSnapshot } from "@/lib/utils/heat";
import { heatToBpm, heatLabel } from "@/lib/utils/heat";
import { humanizeNumber, pctChange } from "@/lib/utils";
import type { TrendingToken } from "@/types/token";

/**
 * Live market vitals panel. Shows the actual math behind the BPM:
 *
 *  - Big BPM number + label (Calm / Steady / Active / Hot / On fire)
 *  - Sentiment direction (avg % change) + gainers/losers count
 *  - Breakdown bars exposing how heat is composed (volatility / breadth / volume)
 *  - Top mover + biggest dump pulled from the trending pool
 *
 * Designed so a degen scanning the page can answer "is the market hot, why,
 * and what's moving" in under a second.
 */
export function MarketPulse({ pulse }: { pulse: HeatSnapshot | null }) {
  const [displayBpm, setDisplayBpm] = useState(55);

  // Smoothly lerp the displayed BPM toward the target so changes don't snap.
  useEffect(() => {
    const target = pulse ? heatToBpm(pulse.heat) : 55;
    let raf = 0;
    const step = () => {
      setDisplayBpm((v) => {
        const next = v + (target - v) * 0.08;
        if (Math.abs(next - target) < 0.4) return target;
        raf = requestAnimationFrame(step);
        return next;
      });
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [pulse]);

  if (!pulse) return <Skeleton />;

  const bpm = Math.round(displayBpm);
  const label = heatLabel(bpm);
  const labelColor = pickLabelColor(label);
  const bullish = pulse.sentiment >= 0;
  const sentimentColor = bullish ? "#0a8f57" : "#c1374a";

  return (
    <div
      className="relative rounded-2xl border border-border-subtle p-3.5 backdrop-blur-md w-full max-w-sm overflow-hidden"
      style={{
        background: "rgba(255, 255, 255, 0.55)",
        boxShadow:
          "0 1px 0 rgba(255,255,255,0.5) inset, 0 6px 20px rgba(10,10,30,0.04)",
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5">
          <span className="relative flex size-1.5">
            <span
              className="absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping"
              style={{ background: bullish ? "#14F195" : "#FF4757" }}
            />
            <span
              className="relative inline-flex size-1.5 rounded-full"
              style={{ background: bullish ? "#14F195" : "#FF4757" }}
            />
          </span>
          <span className="text-[9.5px] uppercase tracking-[0.2em] text-text-secondary font-bold">
            Market Pulse
          </span>
        </div>
        <span className="text-[9.5px] uppercase tracking-[0.16em] text-text-muted">
          live · 30s
        </span>
      </div>

      {/* Big stats row */}
      <div className="flex items-end justify-between mb-3 gap-3">
        <div>
          <div className="text-[28px] font-extrabold text-mono tabular-nums leading-none text-text-primary">
            {bpm}
          </div>
          <div
            className="text-[9.5px] uppercase tracking-[0.16em] mt-1.5 font-bold"
            style={{ color: labelColor }}
          >
            {label} · BPM
          </div>
        </div>
        <div className="text-right">
          <div
            className="flex items-center gap-1 font-mono text-[14px] font-bold justify-end leading-none"
            style={{ color: sentimentColor }}
          >
            <span aria-hidden>{bullish ? "↑" : "↓"}</span>
            <span>{pctChange(pulse.avgChange)}</span>
          </div>
          <div className="text-[10px] text-mono text-text-muted mt-1.5">
            <span className="text-signal-positive font-semibold">
              {pulse.greenCount}↑
            </span>
            {"  "}
            <span className="text-signal-negative font-semibold">
              {pulse.redCount}↓
            </span>
          </div>
        </div>
      </div>

      {/* Breakdown bars */}
      <div className="space-y-1.5 mb-3">
        <BreakdownBar label="Volatility" value={pulse.breakdown.volatility} />
        <BreakdownBar label="Breadth" value={pulse.breakdown.breadth} />
        <BreakdownBar label="Volume" value={pulse.breakdown.volume} />
      </div>

      {/* Movers */}
      <div className="grid grid-cols-2 gap-3 text-[11px] pt-2.5 border-t border-border-subtle">
        <Mover token={pulse.topMover} positive />
        <Mover token={pulse.biggestDump} positive={false} />
      </div>

      {/* Total volume — small footer */}
      {pulse.totalVolume > 0 && (
        <div className="mt-2 flex items-center justify-between text-[10px] text-text-muted">
          <span className="uppercase tracking-[0.14em]">24h vol</span>
          <span className="font-mono text-text-secondary">
            ${humanizeNumber(pulse.totalVolume, 1)}
          </span>
        </div>
      )}
    </div>
  );
}

function BreakdownBar({ label, value }: { label: string; value: number }) {
  const pct = Math.round(value * 100);
  const color = pct > 70 ? "#FF2D9C" : pct > 40 ? "#5E5CFF" : "#94A0B0";
  return (
    <div className="flex items-center gap-2">
      <span className="text-[9px] uppercase tracking-[0.12em] text-text-muted w-[70px] shrink-0 font-bold">
        {label}
      </span>
      <div className="flex-1 h-1.5 rounded-full bg-text-muted/12 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700 ease-out"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      <span className="text-[10px] text-mono text-text-muted w-7 text-right tabular-nums">
        {pct}%
      </span>
    </div>
  );
}

function Mover({
  token,
  positive,
}: {
  token: TrendingToken | null;
  positive: boolean;
}) {
  if (!token) {
    return (
      <div className="flex items-center gap-1.5 text-text-muted">
        <span className="text-[10px]">—</span>
      </div>
    );
  }
  const symbol = (token.symbol ?? "").replace(/^\$/, "").toUpperCase();
  const change = token.price_change_24h ?? 0;
  const changeColor = positive ? "text-signal-positive" : "text-signal-negative";
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <span className={`text-[10px] font-bold ${changeColor}`} aria-hidden>
        {positive ? "▲" : "▼"}
      </span>
      <span className="font-bold text-text-primary text-[11px] truncate">
        {symbol}
      </span>
      <span className={`text-mono text-[11px] ml-auto font-semibold ${changeColor}`}>
        {pctChange(change)}
      </span>
    </div>
  );
}

function pickLabelColor(label: ReturnType<typeof heatLabel>): string {
  switch (label) {
    case "On fire": return "#c1374a";
    case "Hot":     return "#d6601a";
    case "Active":  return "#a3680a";
    case "Steady":  return "#0a6f47";
    case "Calm":    return "#0a8f57";
    default:        return "#0a8f57";
  }
}

function Skeleton() {
  return (
    <div
      className="rounded-2xl border border-border-subtle p-3.5 w-full max-w-sm h-[200px]"
      style={{ background: "rgba(255, 255, 255, 0.4)" }}
    >
      <div className="h-3 w-24 rounded bg-text-muted/15 animate-shimmer mb-3" />
      <div className="h-7 w-16 rounded bg-text-muted/15 animate-shimmer mb-2" />
      <div className="h-2 w-full rounded bg-text-muted/10 animate-shimmer mb-2" />
      <div className="h-2 w-full rounded bg-text-muted/10 animate-shimmer mb-2" />
      <div className="h-2 w-full rounded bg-text-muted/10 animate-shimmer" />
    </div>
  );
}
