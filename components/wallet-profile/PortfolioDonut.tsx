"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as d3 from "d3";
import { animate } from "animejs";
import type { WalletHolding } from "@/lib/data/wallet";
import { humanizeNumber } from "@/lib/utils";

/**
 * Portfolio donut. Top N holdings by USD value rendered as a d3 pie/arc,
 * tail aggregated into "Other" so a long tail of dust doesn't dominate
 * the legend. Hovering a slice highlights it (animates outward + dims
 * the others); the center label switches to that slice's stats.
 *
 * Brand palette: brand colors first, then a rotating list of safe tints
 * so no two adjacent slices ever share a hue.
 */
const PALETTE = [
  "#FF2D9C", // BV pink
  "#5E5CFF", // BV blue
  "#14F195", // Solana green
  "#FFB938", // amber
  "#8A6BFF", // soft purple
  "#FF8B2D", // hot orange
  "#3DDC84", // mint
  "#5e5cff", // indigo
  "#c1374a", // crimson
  "#0a8f57", // forest
];

export function PortfolioDonut({
  holdings,
}: {
  holdings: WalletHolding[];
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  // Filter to holdings that have a USD value (others can't be plotted).
  const priced = useMemo(
    () =>
      holdings.filter(
        (h): h is WalletHolding & { value_usd: number } =>
          typeof h.value_usd === "number" && h.value_usd > 0,
      ),
    [holdings],
  );

  // Bucket the long tail into "Other" so the donut doesn't get cluttered.
  // Top 6 stand alone, everything else rolls up.
  const slices = useMemo(() => {
    const TOP_N = 6;
    const sorted = [...priced].sort(
      (a, b) => (b.value_usd ?? 0) - (a.value_usd ?? 0),
    );
    const head = sorted.slice(0, TOP_N);
    const tail = sorted.slice(TOP_N);
    const tailValue = tail.reduce((acc, h) => acc + (h.value_usd ?? 0), 0);
    const out = head.map((h, i) => ({
      label: h.symbol ?? "—",
      value: h.value_usd ?? 0,
      color: PALETTE[i % PALETTE.length],
      mint: h.mint,
    }));
    if (tailValue > 0) {
      out.push({
        label: `+${tail.length} more`,
        value: tailValue,
        color: "rgba(90, 90, 112, 0.55)",
        mint: "",
      });
    }
    return out;
  }, [priced]);

  const total = slices.reduce((acc, s) => acc + s.value, 0);

  // Animate the slice arcs in from 0 length on mount.
  useEffect(() => {
    if (!svgRef.current) return;
    const arcs = svgRef.current.querySelectorAll("[data-arc]");
    if (!arcs.length) return;
    animate(arcs, {
      opacity: [0, 1],
      duration: 700,
      delay: (_el: Element, i: number) => 90 + i * 60,
      ease: "out(3)",
    });
  }, [slices.length]);

  if (slices.length === 0) {
    return (
      <div
        className="rounded-2xl p-5 sm:p-6 h-[300px] flex flex-col"
        style={{
          background: "var(--glass-medium)",
          border: "1px solid var(--border-subtle)",
        }}
      >
        <Header total={0} />
        <div className="flex-1 flex items-center justify-center text-text-muted text-[13px] text-center px-6">
          No priced holdings yet. Wallet may be SOL-only or holding tokens
          without active DEX pairs.
        </div>
      </div>
    );
  }

  const size = 220;
  const radius = 96;
  const innerRadius = 60;
  const cx = size / 2;
  const cy = size / 2;

  const pie = d3.pie<(typeof slices)[number]>().value((d) => d.value)(slices);
  const arcGen = d3
    .arc<(typeof pie)[number]>()
    .innerRadius(innerRadius)
    .outerRadius(radius)
    .padAngle(0.012)
    .cornerRadius(2);
  const arcHover = d3
    .arc<(typeof pie)[number]>()
    .innerRadius(innerRadius - 1)
    .outerRadius(radius + 6)
    .padAngle(0.012)
    .cornerRadius(2);

  const focused = hoverIdx != null ? slices[hoverIdx] : null;

  return (
    <div
      className="rounded-2xl p-5 sm:p-6 h-[300px] flex flex-col relative overflow-hidden"
      style={{
        background: "var(--glass-medium)",
        border: "1px solid var(--border-subtle)",
        boxShadow:
          "0 1px 0 rgba(255,255,255,0.08) inset, 0 8px 28px rgba(10, 10, 30, 0.05)",
      }}
    >
      <Header total={total} count={priced.length} />

      <div className="flex-1 flex items-center gap-4 sm:gap-6 min-h-0">
        {/* SVG donut */}
        <svg
          ref={svgRef}
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="shrink-0"
          onMouseLeave={() => setHoverIdx(null)}
        >
          <g transform={`translate(${cx}, ${cy})`}>
            {pie.map((p, i) => {
              const path = (hoverIdx === i ? arcHover : arcGen)(p) ?? "";
              const dim = hoverIdx != null && hoverIdx !== i ? 0.22 : 1;
              return (
                <path
                  key={i}
                  data-arc
                  d={path}
                  fill={slices[i].color}
                  opacity={dim}
                  style={{
                    cursor: slices[i].mint ? "pointer" : "default",
                    transition:
                      "d 300ms cubic-bezier(0.22,1,0.36,1), opacity 250ms ease",
                  }}
                  onMouseEnter={() => setHoverIdx(i)}
                  onClick={() => {
                    if (slices[i].mint)
                      window.location.assign(`/token/${slices[i].mint}`);
                  }}
                />
              );
            })}
          </g>
          {/* Center label */}
          <g transform={`translate(${cx}, ${cy})`} pointerEvents="none">
            <text
              textAnchor="middle"
              dy="-4"
              className="font-mono"
              style={{
                fontSize: 11,
                letterSpacing: "0.18em",
                fontWeight: 700,
                fill: "var(--text-muted)",
                textTransform: "uppercase",
              }}
            >
              {focused ? focused.label : "Portfolio"}
            </text>
            <text
              textAnchor="middle"
              dy="14"
              className="font-mono tabular-nums"
              style={{
                fontSize: 18,
                fontWeight: 800,
                fill: "var(--text-primary)",
              }}
            >
              ${humanizeNumber(focused ? focused.value : total, 1)}
            </text>
            <text
              textAnchor="middle"
              dy="30"
              className="font-mono tabular-nums"
              style={{
                fontSize: 10,
                fill: "var(--text-muted)",
              }}
            >
              {focused
                ? `${((focused.value / total) * 100).toFixed(1)}%`
                : "USD"}
            </text>
          </g>
        </svg>

        {/* Legend */}
        <ul className="flex-1 min-w-0 space-y-1.5 text-[12px] overflow-hidden">
          {slices.map((s, i) => {
            const pct = (s.value / total) * 100;
            return (
              <li
                key={s.label + i}
                className="flex items-center gap-2 group cursor-default"
                onMouseEnter={() => setHoverIdx(i)}
                onMouseLeave={() => setHoverIdx(null)}
                style={{
                  opacity: hoverIdx != null && hoverIdx !== i ? 0.42 : 1,
                  transition: "opacity 200ms ease",
                }}
              >
                <span
                  className="size-2.5 rounded-sm shrink-0"
                  style={{ background: s.color }}
                />
                <span className="text-text-primary font-bold text-[12.5px] truncate">
                  {s.label}
                </span>
                <span className="text-text-muted text-mono tabular-nums ml-auto shrink-0">
                  {pct.toFixed(1)}%
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function Header({ total, count }: { total: number; count?: number }) {
  return (
    <div className="flex items-baseline justify-between mb-3">
      <h3 className="text-[10px] uppercase tracking-[0.2em] text-text-muted font-bold">
        Portfolio split
        {count != null && count > 0 && (
          <span className="ml-2 text-[9px] tracking-[0.18em] opacity-70">
            · {count} positions
          </span>
        )}
      </h3>
      <span className="text-[11px] text-text-muted font-mono tabular-nums">
        ${humanizeNumber(total, 1)} total
      </span>
    </div>
  );
}
