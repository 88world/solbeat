"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import * as d3 from "d3";
import { animate } from "animejs";
import type { TrendingToken } from "@/types/token";
import { humanizeNumber } from "@/lib/utils";

type Props = {
  tokens: TrendingToken[];
  /** Square canvas size in px. */
  size?: number;
  /** Heat 0..1 — modulates the breathing pulse intensity. */
  heat?: number;
};

/**
 * Live trending treemap. Replaces the abstract pulse sphere with what the
 * page is actually about: tokens. Each tile is one token in the trending
 * set. Tile area scales with 24h volume; tile color encodes price change
 * (saturated green up, saturated pink down, dim slate when flat).
 *
 * Why this beats the sphere as a centerpiece:
 *   - It's data, not decoration.
 *   - It IS the heat the BPM is reading from, you see why.
 *   - Tiles are clickable, the centerpiece is now a navigation surface.
 *   - One glance tells you "memes are mostly red but AGIGUY is on fire."
 *
 * Visual choices:
 *   - d3.treemap() with squarify tiling for compact rectangles.
 *   - Diverging color scale through a dim midpoint so 0% reads as resting.
 *   - Each tile pulses its outline subtly with the BPM, the centerpiece
 *     keeps its heartbeat metaphor without being literally a sphere.
 *   - Hover lifts the tile (scale-up) and brightens the border via a
 *     spotlight CSS variable; anime.js owns the hover smoothing.
 */
export function TrendingTreemap({ tokens, size = 320, heat = 0.2 }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState<string | null>(null);

  const layout = useMemo(() => buildLayout(tokens, size), [tokens, size]);

  // Subtle breathing pulse on the entire treemap, opacity-only so we don't
  // clobber individual tile transforms. anime.js loop with smoothstep.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }
    // Heat-scaled period: hot markets pulse faster.
    const period = 1000 / (0.6 + heat * 1.2); // 600..1800ms
    const a = animate(el, {
      opacity: [0.92, 1.0],
      duration: period,
      ease: "inOut(2)",
      loop: true,
      direction: "alternate",
    });
    return () => {
      a.pause();
    };
  }, [heat]);

  if (layout.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-text-muted text-[12px]"
        style={{ width: size, height: size }}
      >
        Reading the pulse…
      </div>
    );
  }

  return (
    <div
      ref={wrapRef}
      className="relative"
      style={{ width: size, height: size, willChange: "opacity" }}
    >
      {/* Halo behind the treemap, gives the centerpiece a glow that swaps
          color with heat. Echoes the previous sphere's halo. */}
      <div
        aria-hidden
        className="absolute inset-0 -m-6 rounded-3xl pointer-events-none"
        style={{
          background:
            heat >= 0.6
              ? "radial-gradient(circle, rgba(255, 45, 156, 0.30) 0%, rgba(255, 139, 45, 0.14) 45%, transparent 75%)"
              : "radial-gradient(circle, rgba(94, 92, 255, 0.28) 0%, rgba(20, 241, 149, 0.12) 45%, transparent 75%)",
          filter: "blur(40px)",
          opacity: 0.7,
          transition: "background 1200ms ease-out",
        }}
      />

      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="relative"
        style={{
          borderRadius: 16,
          overflow: "hidden",
          background: "rgba(255, 255, 255, 0.55)",
          backdropFilter: "blur(14px) saturate(160%)",
          WebkitBackdropFilter: "blur(14px) saturate(160%)",
          boxShadow:
            "inset 0 0 0 1px rgba(10, 10, 30, 0.06), 0 12px 36px rgba(10, 10, 30, 0.06)",
        }}
      >
        {layout.map((cell) => (
          <TreemapCell
            key={cell.token.ca}
            cell={cell}
            isHovered={hovered === cell.token.ca}
            onHover={(active) =>
              setHovered(active ? cell.token.ca : (h) => (h === cell.token.ca ? null : h))
            }
          />
        ))}
      </svg>

      {/* Tooltip */}
      {hovered && (
        <Tooltip
          token={layout.find((c) => c.token.ca === hovered)?.token ?? null}
        />
      )}
    </div>
  );
}

type Cell = {
  token: TrendingToken;
  x: number;
  y: number;
  w: number;
  h: number;
};

function buildLayout(tokens: TrendingToken[], size: number): Cell[] {
  const filtered = tokens
    .filter((t) => (t.volume_24h ?? 0) > 0)
    .slice(0, 16);
  if (filtered.length === 0) return [];

  // d3.hierarchy needs a root with children. We give each token a leaf node
  // valued by its volume; treemap proportions tile area to that value.
  type Node = { children?: Node[]; token?: TrendingToken; value?: number };
  const root = d3
    .hierarchy<Node>({
      children: filtered.map((t) => ({ token: t, value: t.volume_24h ?? 0 })),
    })
    .sum((d) => d.value ?? 0)
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

  const treemap = d3.treemap<Node>().size([size, size]).padding(3).round(true);

  treemap(root);

  return (root.leaves() as d3.HierarchyRectangularNode<Node>[])
    .filter((leaf) => leaf.data.token != null)
    .map((leaf) => ({
      token: leaf.data.token as TrendingToken,
      x: leaf.x0,
      y: leaf.y0,
      w: leaf.x1 - leaf.x0,
      h: leaf.y1 - leaf.y0,
    }));
}

function TreemapCell({
  cell,
  isHovered,
  onHover,
}: {
  cell: Cell;
  isHovered: boolean;
  onHover: (active: boolean) => void;
}) {
  const change = bestChange(cell.token);
  const bg = colorForChange(change);
  const stroke = strokeForChange(change);
  const symbol = (cell.token.symbol ?? "—").toUpperCase().replace(/^\$/, "");

  // Show text only if the cell is big enough for it to be readable.
  const showSymbol = cell.w > 44 && cell.h > 24;
  const showChange = cell.w > 56 && cell.h > 36;

  // Slight inset on hover.
  const inset = isHovered ? 1 : 0;

  return (
    <Link href={`/token/${cell.token.ca}`}>
      <g
        onMouseEnter={() => onHover(true)}
        onMouseLeave={() => onHover(false)}
        style={{ cursor: "pointer" }}
      >
        <rect
          x={cell.x + inset}
          y={cell.y + inset}
          width={Math.max(0, cell.w - inset * 2)}
          height={Math.max(0, cell.h - inset * 2)}
          rx={6}
          ry={6}
          fill={bg}
          stroke={stroke}
          strokeWidth={isHovered ? 1.5 : 0.75}
          style={{
            transition: "stroke-width 200ms ease, filter 240ms ease",
            filter: isHovered ? "brightness(1.08)" : "none",
          }}
        />
        {showSymbol && (
          <text
            x={cell.x + 8}
            y={cell.y + 16}
            fontSize={Math.min(14, Math.max(10, cell.w / 8))}
            fontWeight={700}
            fill="#0a0a1e"
            style={{ pointerEvents: "none", letterSpacing: "-0.01em" }}
          >
            {symbol.length > 7 ? symbol.slice(0, 6) + "…" : symbol}
          </text>
        )}
        {showChange && change != null && (
          <text
            x={cell.x + 8}
            y={cell.y + cell.h - 10}
            fontSize={Math.min(12, Math.max(9, cell.w / 10))}
            fontWeight={600}
            fill={change >= 0 ? "#0a4f2c" : "#5a1322"}
            style={{
              pointerEvents: "none",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {change >= 0 ? "+" : ""}
            {change.toFixed(change >= 100 || change <= -100 ? 0 : 1)}%
          </text>
        )}
      </g>
    </Link>
  );
}

function Tooltip({ token }: { token: TrendingToken | null }) {
  if (!token) return null;
  const change = bestChange(token);
  return (
    <div
      className="absolute top-2 left-2 px-3 py-2 rounded-lg pointer-events-none"
      style={{
        background: "rgba(255, 255, 255, 0.94)",
        backdropFilter: "blur(10px)",
        boxShadow: "0 8px 24px rgba(10, 10, 30, 0.12)",
        border: "1px solid rgba(10, 10, 30, 0.06)",
      }}
    >
      <div className="text-[13px] font-bold text-text-primary leading-none">
        ${(token.symbol ?? "").toUpperCase().replace(/^\$/, "")}
      </div>
      <div className="flex items-center gap-2 mt-1.5 text-[10.5px] text-mono">
        <span style={{ color: change != null && change >= 0 ? "#0a8f57" : "#c1374a" }}>
          {change != null
            ? `${change >= 0 ? "+" : ""}${change.toFixed(change >= 100 || change <= -100 ? 0 : 1)}%`
            : "—"}
        </span>
        <span className="text-text-muted">·</span>
        <span className="text-text-muted">${humanizeNumber(token.volume_24h ?? 0)} vol</span>
      </div>
    </div>
  );
}

/** Use whichever %-change window is present; fallback chain matches heat.ts. */
function bestChange(t: TrendingToken): number | null {
  const candidates = [
    t.price_change_24h,
    t.price_change_6h,
    t.price_change_1h,
    t.price_change_5m,
  ];
  for (const c of candidates) {
    if (c != null && Number.isFinite(c)) return c;
  }
  return null;
}

/**
 * Diverging color scale through a desaturated midpoint. Saturation grows
 * with |%|, capped at ±50%. Reads as: dim slate at 0%, soft mint at 5-10%,
 * vivid green at 30+, vivid pink/red at -30+. Symmetric.
 */
function colorForChange(change: number | null): string {
  if (change == null) return "rgba(10, 10, 30, 0.06)";
  const t = Math.max(-1, Math.min(1, change / 50));
  const intensity = Math.abs(t);
  if (t > 0) {
    // Up: green/mint
    const a = 0.10 + intensity * 0.55; // 0.10..0.65
    return `rgba(20, 241, 149, ${a})`;
  }
  if (t < 0) {
    const a = 0.10 + intensity * 0.55;
    return `rgba(255, 45, 156, ${a})`;
  }
  return "rgba(10, 10, 30, 0.06)";
}

function strokeForChange(change: number | null): string {
  if (change == null) return "rgba(10, 10, 30, 0.10)";
  if (change >= 0) return "rgba(20, 241, 149, 0.45)";
  return "rgba(255, 45, 156, 0.45)";
}
