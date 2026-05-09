"use client";

import { useEffect, useState } from "react";
import type { HeatSnapshot } from "@/lib/utils/heat";
import { heatToBpm, heatLabel } from "@/lib/utils/heat";
import { humanizeNumber, pctChange } from "@/lib/utils";
import type { TrendingToken } from "@/types/token";
import { ECGTrace } from "./ECGTrace";

/**
 * Market vitals. Heart-monitor energy:
 *   - ECG trace at the top, scrolling right-to-left at the live BPM cadence
 *   - Huge tabular-num BPM digit display with a colored glow that matches the
 *     heat label (cool green → hot red)
 *   - Sentiment direction + gainers/losers split inline with the BPM
 *   - Compact heat-breakdown bars (volatility / breadth / volume)
 *   - Top mover and biggest dump pulled from the trending pool
 */
export function MarketPulse({ pulse }: { pulse: HeatSnapshot | null }) {
  const [displayBpm, setDisplayBpm] = useState(55);

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
  const traceColor = bullish ? "#FF2D9C" : "#FF4757";

  return (
    <div
      className="relative rounded-2xl border border-border-subtle p-4 backdrop-blur-md w-full max-w-sm overflow-hidden"
      style={{
        background:
          "linear-gradient(180deg, rgba(255, 255, 255, 0.78), rgba(255, 255, 255, 0.55))",
        boxShadow:
          "0 1px 0 rgba(255,255,255,0.7) inset, 0 8px 28px rgba(10, 10, 30, 0.06)",
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
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
          <span className="text-[9.5px] uppercase tracking-[0.22em] text-text-secondary font-bold">
            Market Pulse
          </span>
        </div>
        <span className="text-[9.5px] uppercase tracking-[0.18em] text-text-muted">
          live
        </span>
      </div>

      {/* ECG trace */}
      <div className="mb-3 -mx-1">
        <ECGTrace bpm={bpm} width={320} height={56} color={traceColor} />
      </div>

      {/* Big BPM display */}
      <div className="flex items-end gap-3 mb-3">
        <div className="flex items-baseline gap-1.5">
          <span
            className="text-[44px] sm:text-[52px] font-black text-mono tabular-nums leading-none"
            style={{
              color: labelColor,
              textShadow: `0 0 24px ${labelColor}33, 0 0 4px ${labelColor}55`,
              letterSpacing: "-0.04em",
            }}
          >
            {bpm}
          </span>
          <span className="text-[11px] uppercase tracking-[0.2em] text-text-muted font-bold pb-2">
            BPM
          </span>
        </div>
        <div className="ml-auto text-right pb-1">
          <div
            className="text-[10.5px] uppercase tracking-[0.18em] font-bold"
            style={{ color: labelColor }}
          >
            {label}
          </div>
          <div
            className="flex items-center gap-1 font-mono text-[12.5px] font-bold justify-end leading-none mt-1"
            style={{ color: sentimentColor }}
          >
            <span aria-hidden>{bullish ? "↑" : "↓"}</span>
            <span>{pctChange(pulse.avgChange)}</span>
          </div>
          <div className="text-[10px] text-mono text-text-muted mt-1">
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
      <div className="space-y-1 mb-3">
        <BreakdownBar label="Volatility" value={pulse.breakdown.volatility} />
        <BreakdownBar label="Breadth" value={pulse.breakdown.breadth} />
        <BreakdownBar label="Volume" value={pulse.breakdown.volume} />
      </div>

      {/* Movers */}
      <div className="grid grid-cols-2 gap-3 text-[11px] pt-2.5 border-t border-border-subtle">
        <Mover token={pulse.topMover} positive />
        <Mover token={pulse.biggestDump} positive={false} />
      </div>

      {pulse.totalVolume > 0 && (
        <div className="mt-2 flex items-center justify-between text-[10px] text-text-muted">
          <span className="uppercase tracking-[0.16em]">24h vol</span>
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
          style={{
            width: `${pct}%`,
            background: color,
            boxShadow: pct > 60 ? `0 0 8px ${color}88` : undefined,
          }}
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
      className="rounded-2xl border border-border-subtle p-4 w-full max-w-sm h-[260px]"
      style={{ background: "rgba(255, 255, 255, 0.4)" }}
    >
      <div className="h-3 w-24 rounded bg-text-muted/15 animate-shimmer mb-3" />
      <div className="h-14 w-full rounded bg-text-muted/10 animate-shimmer mb-4" />
      <div className="h-10 w-32 rounded bg-text-muted/15 animate-shimmer mb-3" />
      <div className="space-y-1.5">
        <div className="h-2 w-full rounded bg-text-muted/10 animate-shimmer" />
        <div className="h-2 w-full rounded bg-text-muted/10 animate-shimmer" />
        <div className="h-2 w-full rounded bg-text-muted/10 animate-shimmer" />
      </div>
    </div>
  );
}
