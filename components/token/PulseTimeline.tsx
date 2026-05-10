"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as d3 from "d3";
import {
  detectInflections,
  type PulseInflection,
  type PulseSnapshot,
} from "@/lib/pulse/snapshots";

type Props = {
  snapshots: PulseSnapshot[];
};

/**
 * Pulse history timeline. The moat. Shows how a token's verdict evolved
 * across the last 48 snapshots (≈2 days at 1/hour). Risk score plotted as
 * a smooth area, severity-colored dots for each reading, hover the dots
 * for the full verdict at that moment.
 *
 * D3 used for scales + curve + path generation; React owns the DOM. The
 * "now" reading floats to the right with the current verdict in big type.
 */
export function PulseTimeline({ snapshots }: Props) {
  if (snapshots.length === 0) return null;

  // Snapshots arrive newest-first; chart wants oldest-first for left-to-right.
  const data = useMemo(
    () => [...snapshots].sort((a, b) => a.ts - b.ts),
    [snapshots],
  );
  const latest = snapshots[0];
  const inflections = useMemo(() => detectInflections(snapshots), [snapshots]);

  return (
    <div className="glass rounded-2xl p-5 sm:p-6">
      <div className="flex items-baseline justify-between mb-4 flex-wrap gap-2">
        <div>
          <h3 className="text-[10px] uppercase tracking-[0.2em] text-text-muted font-bold">
            Pulse history
          </h3>
          <p className="text-[11px] text-text-muted mt-0.5">
            {data.length} reading{data.length === 1 ? "" : "s"} ·{" "}
            {humanSpan(data[0].ts, latest.ts)}
          </p>
        </div>
        <div className="text-right">
          <div className="text-[9.5px] uppercase tracking-[0.2em] text-text-muted font-bold mb-0.5">
            Now
          </div>
          <div
            className="text-[13px] font-semibold leading-snug max-w-[260px] text-right"
            style={{ color: severityColor(latest.signal_severity) }}
          >
            {latest.signal_text}
          </div>
        </div>
      </div>

      {inflections.length > 0 && <InflectionBanner items={inflections.slice(0, 3)} />}

      <TimelineChart data={data} />

      {data.length >= 2 && <PreviousReadings data={data} />}
    </div>
  );
}

function InflectionBanner({ items }: { items: PulseInflection[] }) {
  // Pick the most attention-getting inflection by severity weight.
  const weight: Record<PulseInflection["kind"], number> = {
    severity_flip: 4,
    risk_jump: 3,
    price_swing: 3,
    risk_drop: 2,
    new_signal: 1,
  };
  const sorted = [...items].sort((a, b) => weight[b.kind] - weight[a.kind]);
  const headline = sorted[0];
  const rest = sorted.slice(1);
  const color = severityColor(headline.severity);

  return (
    <div
      className="rounded-xl px-4 py-3 mb-4"
      style={{
        background: `${color}0F`,
        boxShadow: `inset 4px 0 0 ${color}`,
      }}
    >
      <div className="flex items-start gap-2">
        <span
          className="size-1.5 rounded-full mt-[7px] shrink-0"
          style={{ background: color }}
        />
        <div className="min-w-0 flex-1">
          <div
            className="text-[12.5px] font-semibold leading-snug"
            style={{ color: "#0a0a1e" }}
          >
            {headline.text}
          </div>
          {rest.length > 0 && (
            <ul className="mt-1.5 space-y-0.5">
              {rest.map((i, idx) => (
                <li
                  key={idx}
                  className="text-[11.5px] text-text-secondary leading-snug"
                >
                  · {i.text}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function TimelineChart({ data }: { data: PulseSnapshot[] }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(720);
  const [hover, setHover] = useState<PulseSnapshot | null>(null);
  const height = 130;
  const margin = { top: 14, right: 12, bottom: 22, left: 32 };

  useEffect(() => {
    if (!wrapRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 720;
      setWidth(Math.max(280, Math.floor(w)));
    });
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  // Scales + path generation. d3 handles the math; we render the SVG.
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;

  const x = useMemo(
    () =>
      d3
        .scaleTime()
        .domain(d3.extent(data, (d) => new Date(d.ts)) as [Date, Date])
        .range([0, innerW]),
    [data, innerW],
  );

  // Risk score 0-100, but invert visually so "low risk" = top, "high risk" = bottom.
  // Reads more naturally: line dips when things are dangerous.
  const y = useMemo(
    () => d3.scaleLinear().domain([0, 100]).range([0, innerH]),
    [innerH],
  );

  const linePath = useMemo(() => {
    const gen = d3
      .line<PulseSnapshot>()
      .defined((d) => d.risk_score != null)
      .x((d) => x(new Date(d.ts)))
      .y((d) => y(d.risk_score ?? 0))
      .curve(d3.curveMonotoneX);
    return gen(data) ?? "";
  }, [data, x, y]);

  const areaPath = useMemo(() => {
    const gen = d3
      .area<PulseSnapshot>()
      .defined((d) => d.risk_score != null)
      .x((d) => x(new Date(d.ts)))
      .y0(innerH)
      .y1((d) => y(d.risk_score ?? 0))
      .curve(d3.curveMonotoneX);
    return gen(data) ?? "";
  }, [data, x, innerH, y]);

  // Sparse axis ticks. Time ticks pick a sensible interval automatically.
  const ticks = x.ticks(Math.min(6, data.length));

  return (
    <div ref={wrapRef} className="relative">
      <svg width={width} height={height} className="block">
        <defs>
          <linearGradient id="pulse-timeline-area" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#FF2D9C" stopOpacity="0.0" />
            <stop offset="60%" stopColor="#FF2D9C" stopOpacity="0.15" />
            <stop offset="100%" stopColor="#FF2D9C" stopOpacity="0.30" />
          </linearGradient>
        </defs>

        <g transform={`translate(${margin.left}, ${margin.top})`}>
          {/* Grid lines at 25, 50, 75 risk */}
          {[25, 50, 75].map((v) => (
            <line
              key={v}
              x1={0}
              x2={innerW}
              y1={y(v)}
              y2={y(v)}
              stroke="rgba(10, 10, 30, 0.06)"
              strokeWidth={1}
            />
          ))}
          {/* Y-axis tick labels (just 25/50/75) */}
          {[25, 50, 75].map((v) => (
            <text
              key={v}
              x={-6}
              y={y(v)}
              dy="0.32em"
              textAnchor="end"
              fontSize={9}
              fill="rgba(10, 10, 30, 0.35)"
              className="text-mono"
            >
              {v}
            </text>
          ))}

          {/* Filled area beneath the line */}
          <path d={areaPath} fill="url(#pulse-timeline-area)" />
          {/* The line itself */}
          <path
            d={linePath}
            fill="none"
            stroke="#FF2D9C"
            strokeWidth={1.75}
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Severity-colored dots, one per snapshot */}
          {data.map((d, i) => {
            const cx = x(new Date(d.ts));
            const cy = y(d.risk_score ?? 0);
            const c = severityColor(d.signal_severity);
            const isLatest = i === data.length - 1;
            return (
              <g key={d.ts}>
                <circle
                  cx={cx}
                  cy={cy}
                  r={isLatest ? 5 : 3.2}
                  fill={c}
                  stroke="#fff"
                  strokeWidth={1.4}
                  style={{ cursor: "pointer" }}
                  onMouseEnter={() => setHover(d)}
                  onMouseLeave={() => setHover(null)}
                />
                {isLatest && (
                  <circle
                    cx={cx}
                    cy={cy}
                    r={9}
                    fill="none"
                    stroke={c}
                    strokeOpacity={0.4}
                    strokeWidth={1.2}
                  >
                    <animate
                      attributeName="r"
                      from="5"
                      to="14"
                      dur="1.4s"
                      repeatCount="indefinite"
                    />
                    <animate
                      attributeName="stroke-opacity"
                      from="0.5"
                      to="0"
                      dur="1.4s"
                      repeatCount="indefinite"
                    />
                  </circle>
                )}
              </g>
            );
          })}

          {/* X-axis tick marks */}
          {ticks.map((t, i) => (
            <text
              key={i}
              x={x(t)}
              y={innerH + 14}
              textAnchor="middle"
              fontSize={9.5}
              fill="rgba(10, 10, 30, 0.45)"
              className="text-mono"
            >
              {formatTick(t, ticks)}
            </text>
          ))}
        </g>
      </svg>

      {/* Hover tooltip */}
      {hover && <HoverCard snap={hover} />}
    </div>
  );
}

function HoverCard({ snap }: { snap: PulseSnapshot }) {
  return (
    <div
      className="absolute top-0 right-0 max-w-[260px] glass rounded-xl p-3 text-[11px] pointer-events-none"
      style={{
        background: "rgba(255, 255, 255, 0.92)",
        boxShadow: "0 12px 30px rgba(10, 10, 30, 0.10)",
      }}
    >
      <div className="text-[9.5px] uppercase tracking-[0.18em] text-text-muted font-bold mb-1">
        {humanWhen(snap.ts)}
      </div>
      <div
        className="text-[12px] font-semibold leading-snug mb-1.5"
        style={{ color: severityColor(snap.signal_severity) }}
      >
        {snap.signal_text}
      </div>
      <div className="flex items-center gap-2 text-[10px] text-text-muted text-mono mb-1">
        {snap.risk_score != null && (
          <span>
            Risk {snap.risk_score} · {snap.risk_label}
          </span>
        )}
        {snap.change_24h != null && (
          <span>
            {snap.change_24h >= 0 ? "+" : ""}
            {snap.change_24h.toFixed(1)}% 24h
          </span>
        )}
      </div>
      {snap.signals.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1">
          {snap.signals.map((s, i) => (
            <span
              key={i}
              className="px-1.5 py-0.5 rounded-full text-[9px] uppercase tracking-[0.10em] font-bold"
              style={{
                background: "rgba(10, 10, 30, 0.05)",
                color: "#3a3a4e",
              }}
            >
              {s}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function PreviousReadings({ data }: { data: PulseSnapshot[] }) {
  // Show two anchor readings for context: "1h ago" and "24h ago" (or whatever
  // is actually present). We pick the closest snapshot to those targets.
  const now = Date.now();
  const want = [
    { label: "1h ago", target: now - 3_600_000 },
    { label: "6h ago", target: now - 6 * 3_600_000 },
    { label: "24h ago", target: now - 24 * 3_600_000 },
  ];
  const picks = want
    .map(({ label, target }) => {
      // Find closest snapshot within 50% of the target offset.
      let best: PulseSnapshot | null = null;
      let bestDist = Infinity;
      for (const d of data) {
        const dist = Math.abs(d.ts - target);
        if (dist < bestDist) {
          bestDist = dist;
          best = d;
        }
      }
      const tolerance = Math.abs(now - target) * 0.6;
      return best && bestDist < tolerance ? { label, snap: best } : null;
    })
    .filter((x): x is { label: string; snap: PulseSnapshot } => x != null);

  if (picks.length === 0) return null;

  return (
    <div className="mt-4 pt-3 border-t border-border-subtle">
      <div className="text-[9.5px] uppercase tracking-[0.2em] text-text-muted font-bold mb-2">
        Previous readings
      </div>
      <ul className="space-y-1.5">
        {picks.map(({ label, snap }) => (
          <li
            key={label}
            className="flex items-start gap-2.5 text-[12px] leading-snug"
          >
            <span className="text-[10px] uppercase tracking-[0.12em] text-text-muted font-bold w-[60px] shrink-0 mt-[2px]">
              {label}
            </span>
            <span
              className="size-2 rounded-full shrink-0 mt-[6px]"
              style={{ background: severityColor(snap.signal_severity) }}
            />
            <span className="text-text-secondary flex-1">
              {snap.signal_text}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function severityColor(sev: PulseSnapshot["signal_severity"]): string {
  switch (sev) {
    case "good": return "#0a8f57";
    case "warn": return "#d6601a";
    case "bad":  return "#c1374a";
    case "neutral":
    default:     return "#5a5a70";
  }
}

function humanWhen(ts: number): string {
  const now = Date.now();
  const diff = now - ts;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)} min ago`;
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)}h ago`;
  return `${Math.round(diff / 86_400_000)}d ago`;
}

function humanSpan(start: number, end: number): string {
  const span = end - start;
  if (span < 3_600_000) return `last ${Math.round(span / 60_000)} min`;
  if (span < 86_400_000) return `last ${Math.round(span / 3_600_000)}h`;
  return `last ${Math.round(span / 86_400_000)}d`;
}

function formatTick(d: Date, ticks: Date[]): string {
  // If the visible span is <= 1 day, format as time; else as month/day.
  const span = ticks.length >= 2
    ? ticks[ticks.length - 1].getTime() - ticks[0].getTime()
    : 0;
  if (span < 24 * 3_600_000) {
    return d3.timeFormat("%-I%p")(d).toLowerCase();
  }
  return d3.timeFormat("%-m/%-d")(d);
}
