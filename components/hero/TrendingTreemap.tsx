"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import * as d3 from "d3";
import { motion, AnimatePresence } from "framer-motion";
import { animate } from "animejs";
import type { TrendingToken } from "@/types/token";
import { humanizeNumber, humanizePrice } from "@/lib/utils";

type Props = {
  tokens: TrendingToken[];
  /** Square canvas size in px. */
  size?: number;
  /** Heat 0..1 — modulates the breathing pulse intensity. */
  heat?: number;
};

/**
 * Live trending treemap, fluid edition. The previous version was an SVG with
 * static rects, which is what the user called "data viz that sucks." This
 * one is HTML-driven so framer-motion can do real spring physics on every
 * tile:
 *
 *   - Tiles are motion.div with `layout` prop. When the trending list
 *     reorders or sizes change, every tile springs into its new position
 *     instead of jumping.
 *   - Hovering a tile scales it 1.07× with a stiff spring (`stiffness: 280,
 *     damping: 22`) and lifts its z-index above siblings.
 *   - On hover, the tile expands a detail overlay: full symbol + name + price
 *     + multi-timeframe %change row, no tooltip-needed friction.
 *   - AnimatePresence handles enter/exit if the trending set changes
 *     membership; new tiles fade+scale in, removed tiles fade out.
 *   - The whole grid breathes opacity 0.94↔1.0 on a heat-scaled period via
 *     anime.js loop. Centerpiece keeps its heartbeat.
 *
 * Color encodes %change through a saturation-weighted diverging scale, with
 * a glowing inner gradient that intensifies with |%|. The "ripping" tiles
 * literally glow.
 */
export function TrendingTreemap({ tokens, size = 340, heat = 0.2 }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState<string | null>(null);

  const layout = useMemo(() => buildLayout(tokens, size), [tokens, size]);

  // Heartbeat opacity loop (preserves the metaphor without the literal sphere).
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }
    const period = 1000 / (0.55 + heat * 1.0); // 600..1800ms
    const a = animate(el, {
      opacity: [0.94, 1.0],
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
        className="flex items-center justify-center text-text-muted text-[12px] rounded-2xl"
        style={{ width: size, height: size, background: "rgba(255,255,255,0.4)" }}
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
      {/* Halo behind the treemap, heat-keyed. */}
      <div
        aria-hidden
        className="absolute inset-0 -m-8 rounded-3xl pointer-events-none"
        style={{
          background:
            heat >= 0.6
              ? "radial-gradient(circle, rgba(255, 45, 156, 0.35) 0%, rgba(255, 139, 45, 0.16) 45%, transparent 75%)"
              : "radial-gradient(circle, rgba(94, 92, 255, 0.30) 0%, rgba(20, 241, 149, 0.12) 45%, transparent 75%)",
          filter: "blur(48px)",
          opacity: 0.75,
          transition: "background 1200ms ease-out",
        }}
      />

      <div
        className="relative w-full h-full overflow-hidden"
        style={{
          borderRadius: 16,
          background: "var(--glass-medium)",
          backdropFilter: "blur(14px) saturate(160%)",
          WebkitBackdropFilter: "blur(14px) saturate(160%)",
          boxShadow:
            "inset 0 0 0 1px rgba(10, 10, 30, 0.06), 0 14px 40px rgba(10, 10, 30, 0.07)",
        }}
      >
        <AnimatePresence>
          {layout.map((cell) => (
            <Tile
              key={cell.token.ca}
              cell={cell}
              isHovered={hovered === cell.token.ca}
              onHover={(active) => setHovered(active ? cell.token.ca : null)}
            />
          ))}
        </AnimatePresence>
      </div>
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

  type Node = { children?: Node[]; token?: TrendingToken; value?: number };
  const root = d3
    .hierarchy<Node>({
      children: filtered.map((t) => ({ token: t, value: t.volume_24h ?? 0 })),
    })
    .sum((d) => d.value ?? 0)
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

  const treemap = d3.treemap<Node>().size([size, size]).padding(4).round(true);
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

function Tile({
  cell,
  isHovered,
  onHover,
}: {
  cell: Cell;
  isHovered: boolean;
  onHover: (active: boolean) => void;
}) {
  const change = bestChange(cell.token);
  const symbol = (cell.token.symbol ?? "—").toUpperCase().replace(/^\$/, "");
  const showSymbol = cell.w > 50 && cell.h > 30;
  const showChange = cell.w > 60 && cell.h > 44;
  const positive = change != null && change >= 0;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{
        opacity: 1,
        scale: 1,
        x: cell.x,
        y: cell.y,
        width: cell.w,
        height: cell.h,
      }}
      exit={{ opacity: 0, scale: 0.8 }}
      transition={{
        type: "spring",
        stiffness: 220,
        damping: 26,
        mass: 0.9,
      }}
      whileHover={{
        scale: 1.06,
        zIndex: 30,
        transition: { type: "spring", stiffness: 280, damping: 22 },
      }}
      onPointerEnter={() => onHover(true)}
      onPointerLeave={() => onHover(false)}
      className="absolute cursor-pointer"
      style={{
        position: "absolute",
        zIndex: isHovered ? 30 : 1,
        willChange: "transform",
      }}
    >
      <Link
        href={`/token/${cell.token.ca}`}
        className="block w-full h-full"
        style={{ width: cell.w, height: cell.h }}
      >
        <TileContent
          cell={cell}
          symbol={symbol}
          change={change}
          positive={positive}
          showSymbol={showSymbol}
          showChange={showChange}
          isHovered={isHovered}
        />
      </Link>
    </motion.div>
  );
}

function TileContent({
  cell,
  symbol,
  change,
  positive,
  showSymbol,
  showChange,
  isHovered,
}: {
  cell: Cell;
  symbol: string;
  change: number | null;
  positive: boolean;
  showSymbol: boolean;
  showChange: boolean;
  isHovered: boolean;
}) {
  const intensity = Math.min(1, Math.abs(change ?? 0) / 50);
  const baseColor = positive ? "20, 241, 149" : "255, 45, 156";

  return (
    <div
      className="w-full h-full rounded-lg relative overflow-hidden flex flex-col justify-between p-2"
      style={{
        background: `radial-gradient(120% 120% at 50% 110%, rgba(${baseColor}, ${0.10 + intensity * 0.45}) 0%, rgba(${baseColor}, ${0.06 + intensity * 0.20}) 60%, rgba(${baseColor}, 0.04) 100%)`,
        boxShadow: isHovered
          ? `inset 0 0 0 2px rgba(${baseColor}, 0.7), 0 8px 24px rgba(${baseColor}, 0.30)`
          : `inset 0 0 0 1px rgba(${baseColor}, ${0.20 + intensity * 0.35})`,
        transition:
          "box-shadow 220ms cubic-bezier(0.22, 1, 0.36, 1), background 220ms ease-out",
      }}
    >
      {/* Inner glow that intensifies with %change magnitude. */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(circle at 50% 100%, rgba(${baseColor}, ${intensity * 0.35}) 0%, transparent 60%)`,
          filter: "blur(8px)",
        }}
      />

      {/* Top row: symbol + token image */}
      {showSymbol && (
        <div className="flex items-center gap-1.5 relative z-10 min-w-0">
          {cell.token.image && cell.w > 80 && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={cell.token.image}
              alt={symbol}
              className="size-4 rounded shrink-0 object-cover"
              referrerPolicy="no-referrer"
            />
          )}
          <span
            className="text-[12px] font-bold text-text-primary truncate tracking-tight"
            style={{
              fontSize: Math.min(14, Math.max(10, cell.w / 8)),
            }}
          >
            {symbol.length > 8 ? symbol.slice(0, 7) + "…" : symbol}
          </span>
        </div>
      )}

      {/* Bottom row: %change. Big tabular number that count-ups via
          anime.js whenever the data updates so the tile reads as live. */}
      {showChange && change != null && (
        <AnimatedPercent
          change={change}
          positive={positive}
          width={cell.w}
        />
      )}

      {/* Hover detail overlay — appears smoothly when the tile is focused. */}
      <AnimatePresence>
        {isHovered && cell.w > 80 && cell.h > 50 && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ type: "spring", stiffness: 360, damping: 26 }}
            className="absolute inset-x-2 bottom-2 z-20 rounded-md px-2 py-1.5"
            style={{
              background: "rgba(255, 255, 255, 0.92)",
              backdropFilter: "blur(8px)",
              boxShadow: "0 4px 14px rgba(10, 10, 30, 0.10)",
            }}
          >
            <div className="text-[10px] text-text-muted text-mono leading-none">
              {humanizePrice(cell.token.price_usd)}
            </div>
            <div className="flex items-center gap-1 mt-1 text-[9px]">
              <TimeChip label="1h" v={cell.token.price_change_1h} />
              <TimeChip label="6h" v={cell.token.price_change_6h} />
              <TimeChip label="24h" v={cell.token.price_change_24h} />
            </div>
            <div className="text-[9px] text-text-muted text-mono mt-1">
              vol ${humanizeNumber(cell.token.volume_24h ?? 0)}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * Per-tile animated percent. anime.js tweens between previous and new value
 * whenever `change` updates, plus fires a brief glow flash so the tile
 * visibly responds. Without this the treemap looked frozen between data
 * polls (user complaint: "doesn't look smooth, no anime.js").
 */
function AnimatedPercent({
  change,
  positive,
  width,
}: {
  change: number;
  positive: boolean;
  width: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const valRef = useRef<HTMLSpanElement>(null);
  const lastRef = useRef(change);

  useEffect(() => {
    const obj = { v: lastRef.current };
    const a = animate(obj, {
      v: change,
      duration: 700,
      ease: "out(3)",
      onUpdate: () => {
        if (valRef.current) {
          const v = obj.v;
          valRef.current.textContent = `${v >= 0 ? "+" : ""}${v.toFixed(v >= 100 || v <= -100 ? 0 : 1)}%`;
        }
        lastRef.current = obj.v;
      },
    });
    // Flash the tile container so the change is unmistakable.
    if (ref.current && Math.abs(change - lastRef.current) > 0.5) {
      const flashColor = change >= 0 ? "rgba(20,241,149,0.6)" : "rgba(255,45,156,0.6)";
      animate(ref.current, {
        textShadow: [
          `0 0 0px ${flashColor}, 0 0 0px ${flashColor}`,
          `0 0 12px ${flashColor}, 0 0 4px ${flashColor}`,
          `0 0 0px ${flashColor}, 0 0 0px ${flashColor}`,
        ],
        duration: 800,
        ease: "out(3)",
      });
    }
    return () => {
      a.pause();
    };
  }, [change]);

  return (
    <div
      ref={ref}
      className="text-mono font-bold relative z-10"
      style={{
        color: positive ? "#0a4f2c" : "#5a1322",
        fontSize: Math.min(15, Math.max(11, width / 7)),
        fontVariantNumeric: "tabular-nums",
      }}
    >
      <span ref={valRef}>
        {change >= 0 ? "+" : ""}
        {change.toFixed(change >= 100 || change <= -100 ? 0 : 1)}%
      </span>
    </div>
  );
}

function TimeChip({ label, v }: { label: string; v: number | null | undefined }) {
  if (v == null) return null;
  const up = v >= 0;
  return (
    <span
      className="px-1 rounded font-mono"
      style={{
        background: up ? "rgba(20, 241, 149, 0.14)" : "rgba(255, 45, 156, 0.14)",
        color: up ? "#0a8f57" : "#c1374a",
      }}
    >
      {label} {up ? "+" : ""}
      {v.toFixed(v >= 100 || v <= -100 ? 0 : 1)}%
    </span>
  );
}

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
