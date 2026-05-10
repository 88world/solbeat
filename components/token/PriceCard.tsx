"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as d3 from "d3";
import { animate } from "animejs";
import type { TokenAnalysis, TokenMarket } from "@/types/token";
import { humanizeNumber, humanizePrice } from "@/lib/utils";

type LivePoll = {
  price_usd: number | null;
  price_change_5m: number | null;
  price_change_1h: number | null;
  price_change_6h: number | null;
  price_change_24h: number | null;
  price_change_7d?: number | null;
  volume_24h: number | null;
  liquidity_usd: number | null;
  market_cap: number | null;
  fdv: number | null;
};

export function PriceCard({ analysis }: { analysis: TokenAnalysis }) {
  // Initial market data from SSR. Polling overrides specific fields.
  const initial = analysis.market;
  const [live, setLive] = useState<LivePoll | null>(null);
  const lastPriceRef = useRef<number | null>(initial.price_usd);
  const flashRef = useRef<HTMLDivElement>(null);

  // Poll /api/token/{ca}/quick every 30s. Updates price + changes + volume
  // without rerunning the AI pipeline. When the price moves between polls,
  // briefly flash the card border in the direction of the move so the user
  // catches the update without staring.
  useEffect(() => {
    if (!analysis.metadata.ca) return;
    let cancelled = false;
    const refresh = async () => {
      try {
        const r = await fetch(`/api/token/${analysis.metadata.ca}/quick`, {
          cache: "no-store",
        });
        if (!r.ok) return;
        const data = (await r.json()) as LivePoll;
        if (cancelled) return;
        // Detect a price tick to flash the border.
        const prev = lastPriceRef.current;
        const next = data.price_usd;
        if (prev != null && next != null && prev !== next && flashRef.current) {
          const up = next > prev;
          const color = up ? "rgba(20, 241, 149, 0.55)" : "rgba(255, 45, 156, 0.55)";
          flashRef.current.style.boxShadow = `0 0 0 2px ${color}, 0 6px 18px rgba(10,10,30,0.04)`;
          animate(flashRef.current, {
            boxShadow: ["0 0 0 2px " + color + ", 0 6px 18px rgba(10,10,30,0.04)", "0 0 0 0px " + color + ", 0 6px 18px rgba(10,10,30,0.04)"],
            duration: 1200,
            ease: "out(3)",
          });
        }
        lastPriceRef.current = next;
        setLive(data);
      } catch {
        /* noop */
      }
    };
    // Don't fire immediately, the SSR data is fresh. First poll after 30s.
    const id = setInterval(refresh, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [analysis.metadata.ca]);

  // Merge live → initial for display. Live wins where present.
  const m: TokenMarket = useMemo(() => {
    if (!live) return initial;
    return {
      ...initial,
      price_usd: live.price_usd ?? initial.price_usd,
      price_change_1h: live.price_change_1h ?? initial.price_change_1h,
      price_change_24h: live.price_change_24h ?? initial.price_change_24h,
      price_change_7d: live.price_change_7d ?? initial.price_change_7d,
      volume_24h: live.volume_24h ?? initial.volume_24h,
      liquidity_usd: live.liquidity_usd ?? initial.liquidity_usd,
      market_cap: live.market_cap ?? initial.market_cap,
      fdv: live.fdv ?? initial.fdv,
    };
  }, [initial, live]);

  const change24 = m.price_change_24h;
  const positive = (change24 ?? 0) >= 0;

  // Reconstruct a sparse price track from the available % change windows.
  // We only have aggregate %-deltas (no raw OHLC), so we walk back from
  // the current price using each change-since to estimate prior prices.
  // 6 anchors gives the eye enough shape to read "trending up" vs "spike".
  const sparkline = useMemo(() => buildSparkline(m), [m]);

  return (
    <div
      ref={flashRef}
      className="glass rounded-2xl p-5 sm:p-6 h-full flex flex-col transition-shadow duration-300"
    >
      <div className="flex items-baseline gap-3 flex-wrap">
        <div className="text-[40px] sm:text-[48px] leading-none font-semibold text-mono tracking-tight">
          <PriceCountUp value={m.price_usd} />
        </div>
        {live && (
          <span
            className="ml-auto text-[9.5px] uppercase tracking-[0.20em] font-bold inline-flex items-center gap-1.5 text-text-muted"
            title="Polling /api/token/{ca}/quick every 30s"
          >
            <span className="relative flex">
              <span
                className="absolute inset-0 size-1.5 rounded-full animate-ping"
                style={{ background: "#FF2D9C" }}
              />
              <span
                className="relative size-1.5 rounded-full"
                style={{ background: "#FF2D9C" }}
              />
            </span>
            Live
          </span>
        )}
        {change24 != null && (
          <div
            className={`text-[15px] font-medium text-mono ${
              positive ? "text-signal-positive" : "text-signal-negative"
            }`}
          >
            <PctCountUp value={change24} />
            <span className="text-text-muted text-[12px] ml-1">24h</span>
          </div>
        )}
      </div>

      {/* Sparkline. Smooth monotone-X curve through the reconstructed price
          track, gradient-filled area underneath. Adds the "is it trending up
          or spike-and-fade?" read at a glance. */}
      {sparkline && <PriceSparkline data={sparkline} positive={positive} />}

      {/* Multi-timeframe % strip. Quick read of shape across windows. */}
      <TimeframeStrip
        changes={{
          "5m": m.price_change_1h != null && (m as { price_change_5m?: number | null }).price_change_5m,
          "1h": m.price_change_1h,
          "24h": m.price_change_24h,
          "7d": m.price_change_7d,
        }}
      />

      <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3 text-[12px]">
        <PremiumStat
          label="Market cap"
          numeric={m.market_cap ?? m.fdv ?? null}
          format={(n) => `$${humanizeNumber(n)}`}
        />
        <PremiumStat
          label="24h volume"
          numeric={m.volume_24h ?? null}
          format={(n) => `$${humanizeNumber(n)}`}
        />
        <PremiumStat
          label="Liquidity"
          numeric={m.liquidity_usd ?? null}
          format={(n) => `$${humanizeNumber(n)}`}
        />
        <PremiumStat
          label="Pool age"
          numeric={m.pair_age_hours ?? null}
          format={(h) => formatAge(h)}
          // Pool age never flashes — it monotonically increases by minutes.
          neverFlash
        />
      </div>
    </div>
  );
}

/**
 * Smooth count-up between price values. We don't restart from zero, we tween
 * from the *previously displayed* number to the new target, so a sequence of
 * polls looks like the digits ticking up/down in place rather than blinking.
 * Duration is short (520ms) — long enough to be readable, fast enough that a
 * 30s poll cadence doesn't have stale tweens overlapping the next print.
 *
 * Falls back to the static formatted value when `value` is null or NaN.
 */
function PriceCountUp({ value }: { value: number | null }) {
  const ref = useRef<HTMLSpanElement>(null);
  const lastRef = useRef<number | null>(value);

  useEffect(() => {
    if (!ref.current) return;
    if (value == null || !Number.isFinite(value)) {
      ref.current.textContent = humanizePrice(value);
      lastRef.current = value;
      return;
    }
    const start = lastRef.current ?? value;
    // Skip the tween on the very first render — feels jarring to animate
    // from the same value, and we'd otherwise burn a frame.
    if (start === value) {
      ref.current.textContent = humanizePrice(value);
      return;
    }
    const obj = { v: start };
    const a = animate(obj, {
      v: value,
      duration: 520,
      ease: "out(3)",
      onUpdate: () => {
        if (ref.current) ref.current.textContent = humanizePrice(obj.v);
      },
    });
    lastRef.current = value;
    return () => {
      a.pause();
    };
  }, [value]);

  return <span ref={ref}>{humanizePrice(value)}</span>;
}

function PriceSparkline({
  data,
  positive,
}: {
  data: Array<{ ts: number; price: number }>;
  positive: boolean;
}) {
  const width = 480;
  const height = 60;
  const pad = { top: 4, right: 4, bottom: 4, left: 4 };

  const x = useMemo(
    () =>
      d3
        .scaleLinear()
        .domain([0, data.length - 1])
        .range([pad.left, width - pad.right]),
    [data.length],
  );

  const y = useMemo(() => {
    const ext = d3.extent(data, (d) => d.price) as [number, number];
    const min = ext[0] * 0.998;
    const max = ext[1] * 1.002;
    return d3
      .scaleLinear()
      .domain([min, max])
      .range([height - pad.bottom, pad.top]);
  }, [data]);

  const linePath = useMemo(() => {
    const gen = d3
      .line<(typeof data)[number]>()
      .x((_, i) => x(i))
      .y((d) => y(d.price))
      .curve(d3.curveMonotoneX);
    return gen(data) ?? "";
  }, [data, x, y]);

  const areaPath = useMemo(() => {
    const gen = d3
      .area<(typeof data)[number]>()
      .x((_, i) => x(i))
      .y0(height - pad.bottom)
      .y1((d) => y(d.price))
      .curve(d3.curveMonotoneX);
    return gen(data) ?? "";
  }, [data, x, y]);

  const stroke = positive ? "#0a8f57" : "#c1374a";
  const fillId = positive ? "spark-grad-up" : "spark-grad-dn";

  return (
    <svg
      className="mt-5 w-full"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      style={{ display: "block", height: 60 }}
      aria-hidden
    >
      <defs>
        <linearGradient id="spark-grad-up" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#0a8f57" stopOpacity="0.32" />
          <stop offset="100%" stopColor="#0a8f57" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="spark-grad-dn" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#c1374a" stopOpacity="0.32" />
          <stop offset="100%" stopColor="#c1374a" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${fillId})`} />
      <path
        d={linePath}
        fill="none"
        stroke={stroke}
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* "Now" dot at the right */}
      <circle
        cx={x(data.length - 1)}
        cy={y(data[data.length - 1].price)}
        r={3}
        fill={stroke}
      />
    </svg>
  );
}

function TimeframeStrip({
  changes,
}: {
  changes: Record<string, number | null | undefined | false>;
}) {
  const entries = Object.entries(changes).filter(
    ([, v]) => typeof v === "number",
  ) as Array<[string, number]>;
  if (entries.length === 0) return null;
  return (
    <div className="mt-3 grid grid-cols-4 gap-2">
      {entries.map(([label, v]) => {
        const up = v >= 0;
        return (
          <div
            key={label}
            className="rounded-lg px-2.5 py-1.5"
            style={{
              background: up ? "rgba(20, 241, 149, 0.07)" : "rgba(193, 55, 74, 0.07)",
              boxShadow: `inset 0 0 0 1px ${
                up ? "rgba(20, 241, 149, 0.20)" : "rgba(193, 55, 74, 0.20)"
              }`,
            }}
          >
            <div className="text-[9.5px] uppercase tracking-[0.18em] text-text-muted font-bold">
              {label}
            </div>
            <div
              className="text-[12.5px] font-semibold text-mono mt-0.5"
              style={{ color: up ? "#0a8f57" : "#c1374a" }}
            >
              {up ? "+" : ""}
              {v.toFixed(v >= 100 || v <= -100 ? 0 : 2)}%
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Reconstruct a sparse price series by walking back from the current price
 * using each change-since-X window. We only have %-deltas, not OHLC, so this
 * is a "dot, dot, dot, dot" projection rather than a real candle. Still
 * useful as a shape read.
 */
function buildSparkline(
  m: TokenAnalysis["market"],
): Array<{ ts: number; price: number }> | null {
  const now = m.price_usd;
  if (now == null) return null;

  const points: Array<{ ts: number; price: number }> = [];
  const stamp = (label: string, hoursAgo: number, change: number | null | undefined) => {
    if (typeof change !== "number") return;
    // price_then = price_now / (1 + change/100), since change = (now-then)/then * 100
    const denom = 1 + change / 100;
    if (!Number.isFinite(denom) || denom <= 0) return;
    points.push({
      ts: Date.now() - hoursAgo * 3_600_000,
      price: now / denom,
    });
  };

  stamp("7d", 24 * 7, m.price_change_7d);
  // 6h not always present on this type, fall back to interpolating between 24h and 1h.
  stamp("24h", 24, m.price_change_24h);
  stamp("1h", 1, m.price_change_1h);
  // The "now" point.
  points.push({ ts: Date.now(), price: now });

  // Need at least 3 anchors for a meaningful curve.
  if (points.length < 3) return null;

  // Sort chronologically.
  points.sort((a, b) => a.ts - b.ts);
  return points;
}

/**
 * 24h %-change with the same smooth tween treatment as the price digits.
 * Sign + suffix stay rendered as plain text, only the magnitude tweens so
 * the +/- arrow doesn't flicker. Color is set by the parent.
 */
function PctCountUp({ value }: { value: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const lastRef = useRef(value);

  useEffect(() => {
    if (!ref.current) return;
    if (!Number.isFinite(value)) return;
    const start = lastRef.current;
    if (start === value) {
      ref.current.textContent = formatPct(value);
      return;
    }
    const obj = { v: start };
    const a = animate(obj, {
      v: value,
      duration: 520,
      ease: "out(3)",
      onUpdate: () => {
        if (ref.current) ref.current.textContent = formatPct(obj.v);
      },
    });
    lastRef.current = value;
    return () => {
      a.pause();
    };
  }, [value]);

  return <span ref={ref}>{formatPct(value)}</span>;
}

function formatPct(v: number): string {
  const sign = v >= 0 ? "+" : "";
  return `${sign}${v.toFixed(Math.abs(v) >= 100 ? 0 : 2)}%`;
}

/**
 * Premium replacement for the old plain-text Stat tile. Each tile has:
 *   - microscale label in uppercase / wide tracking, BV brand small caps
 *   - tabular-num value that tweens between polls (so $1.32M → $1.35M
 *     ticks visibly instead of snapping)
 *   - a soft border + 1px inset shadow so the tile reads as a discrete
 *     surface, not just text-on-glass
 *   - a brief green/blue flash on the value when it changes, so the eye
 *     catches a refresh without staring
 */
function PremiumStat({
  label,
  numeric,
  format,
  neverFlash,
}: {
  label: string;
  numeric: number | null;
  format: (n: number) => string;
  neverFlash?: boolean;
}) {
  const valueRef = useRef<HTMLDivElement>(null);
  const lastDisplayedRef = useRef<number | null>(numeric);

  useEffect(() => {
    if (!valueRef.current) return;
    if (numeric == null || !Number.isFinite(numeric)) {
      valueRef.current.textContent = "-";
      lastDisplayedRef.current = null;
      return;
    }
    const start = lastDisplayedRef.current;
    if (start == null || start === numeric) {
      valueRef.current.textContent = format(numeric);
      lastDisplayedRef.current = numeric;
      return;
    }
    // Tween the value through the format function.
    const obj = { v: start };
    const a = animate(obj, {
      v: numeric,
      duration: 700,
      ease: "out(3)",
      onUpdate: () => {
        if (valueRef.current) valueRef.current.textContent = format(obj.v);
      },
    });
    lastDisplayedRef.current = numeric;
    // Flash the tile color briefly to draw the eye.
    if (!neverFlash) {
      const tile = valueRef.current.parentElement;
      if (tile) {
        const up = numeric >= start;
        const color = up ? "rgba(20, 241, 149, 0.35)" : "rgba(255, 45, 156, 0.35)";
        animate(tile, {
          boxShadow: [
            "inset 0 0 0 1px rgba(10, 10, 30, 0.06), 0 0 0 0 rgba(0,0,0,0)",
            `inset 0 0 0 1px ${color}, 0 0 18px ${color}`,
            "inset 0 0 0 1px rgba(10, 10, 30, 0.06), 0 0 0 0 rgba(0,0,0,0)",
          ],
          duration: 1100,
          ease: "out(3)",
        });
      }
    }
    return () => {
      a.pause();
    };
  }, [numeric, format, neverFlash]);

  return (
    <div
      className="rounded-xl px-3 py-2.5 relative overflow-hidden"
      style={{
        background:
          "linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0))",
        boxShadow: "inset 0 0 0 1px rgba(10, 10, 30, 0.06)",
        transition: "box-shadow 250ms ease",
      }}
    >
      <div className="text-text-muted text-[9.5px] uppercase tracking-[0.18em] font-bold">
        {label}
      </div>
      <div
        ref={valueRef}
        className="text-text-primary text-[14px] font-mono tabular-nums mt-1 font-semibold"
      >
        {numeric != null ? format(numeric) : "-"}
      </div>
    </div>
  );
}

function formatAge(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  if (hours < 24) return `${hours.toFixed(1)}h`;
  if (hours < 24 * 30) return `${Math.round(hours / 24)}d`;
  return `${Math.round(hours / 24 / 30)}mo`;
}
