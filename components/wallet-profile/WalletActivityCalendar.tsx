"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as d3 from "d3";
import { animate } from "animejs";
import type { WalletActivity } from "@/lib/data/wallet";

/**
 * 90-day activity heatmap. Each cell is one UTC day, color saturation
 * scales with the number of signatures we observed that day. Hovering
 * surfaces the count + date in a tooltip.
 *
 * Why a heatmap and not a sparkline? The shape of activity matters more
 * than the absolute count — degens want to see streaks ("active every
 * day for 3 weeks then went silent") which a line buries.
 *
 * Numbers are visible at a glance:
 *   - 0 txns = empty cell
 *   - 1-3   = light pink
 *   - 4-15  = mid pink
 *   - 16-50 = bright pink
 *   - 50+   = brand pink + glow
 */
export function WalletActivityCalendar({
  activity,
}: {
  activity: WalletActivity;
}) {
  const gridRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<null | {
    date: string;
    count: number;
    x: number;
    y: number;
  }>(null);

  const DAYS = 90;
  const today = useMemo(() => {
    const d = new Date();
    d.setUTCHours(0, 0, 0, 0);
    return d;
  }, []);

  // Build the calendar: oldest day on left, today on right. Each cell
  // gets the count from the activity buckets (0 if no transactions).
  const cells = useMemo(() => {
    const map = new Map(activity.days.map((d) => [d.date, d.count]));
    const out: { date: string; count: number }[] = [];
    for (let i = DAYS - 1; i >= 0; i--) {
      const d = new Date(today.getTime() - i * 86400_000);
      const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
      out.push({ date: key, count: map.get(key) ?? 0 });
    }
    return out;
  }, [activity.days, today]);

  const totalTxns = useMemo(
    () => cells.reduce((acc, c) => acc + c.count, 0),
    [cells],
  );

  const activeDays = useMemo(
    () => cells.filter((c) => c.count > 0).length,
    [cells],
  );

  const longestStreak = useMemo(() => {
    let best = 0;
    let cur = 0;
    for (const c of cells) {
      if (c.count > 0) {
        cur++;
        if (cur > best) best = cur;
      } else {
        cur = 0;
      }
    }
    return best;
  }, [cells]);

  // Color scale: square-root keeps the heavy days visible without
  // saturating early. Brand pink → soft pink → empty.
  const colorScale = useMemo(() => {
    const max = d3.max(cells, (c) => c.count) ?? 0;
    return d3
      .scaleSqrt<string>()
      .domain([0, Math.max(1, max)])
      .range(["rgba(255, 45, 156, 0)", "#FF2D9C"])
      .clamp(true);
  }, [cells]);

  // Animate cells in from below on mount, staggered.
  useEffect(() => {
    if (!gridRef.current) return;
    const dots = gridRef.current.querySelectorAll("[data-heat-cell]");
    if (!dots.length) return;
    animate(dots, {
      opacity: [0, 1],
      translateY: [4, 0],
      duration: 500,
      delay: (_el: Element, i: number) => 80 + (i % 14) * 18,
      ease: "out(3)",
    });
  }, [cells]);

  // Layout: 15 columns × 6 rows of pseudo-weeks (since 90 / 6 = 15).
  // Each "row" is a week-ish band so the calendar reads chronologically
  // left → right with newest in the bottom-right corner.
  const COLS = 15;
  const ROWS = Math.ceil(DAYS / COLS);

  return (
    <div
      className="rounded-2xl p-5 sm:p-6 h-[300px] flex flex-col relative"
      style={{
        background: "var(--glass-medium)",
        border: "1px solid var(--border-subtle)",
        boxShadow:
          "0 1px 0 rgba(255,255,255,0.08) inset, 0 8px 28px rgba(10, 10, 30, 0.05)",
      }}
    >
      <div className="flex items-baseline justify-between mb-3 flex-wrap gap-2">
        <h3 className="text-[10px] uppercase tracking-[0.2em] text-text-muted font-bold">
          Activity · last 90 days
        </h3>
        <div className="flex items-center gap-3 text-[10px] text-text-muted">
          <span className="font-mono tabular-nums">
            <span className="text-text-secondary font-bold">{totalTxns}</span> txns
          </span>
          <span className="font-mono tabular-nums">
            <span className="text-text-secondary font-bold">{activeDays}</span>{" "}
            active days
          </span>
          <span className="font-mono tabular-nums">
            <span className="text-text-secondary font-bold">{longestStreak}</span>{" "}
            day streak
          </span>
        </div>
      </div>

      <div
        ref={gridRef}
        className="flex-1 grid gap-1.5 min-h-0 relative"
        style={{
          gridTemplateColumns: `repeat(${COLS}, 1fr)`,
          gridTemplateRows: `repeat(${ROWS}, 1fr)`,
        }}
      >
        {cells.map((c, i) => {
          const color = c.count > 0 ? colorScale(c.count) : "rgba(10, 10, 30, 0.05)";
          const glow =
            c.count >= 50
              ? `0 0 12px ${color}88`
              : c.count > 0
                ? `0 0 4px ${color}55`
                : undefined;
          return (
            <button
              key={c.date}
              type="button"
              data-heat-cell
              aria-label={`${c.count} transactions on ${c.date}`}
              className="rounded-md transition cursor-default hover:scale-110"
              style={{
                background: color,
                boxShadow: glow ?? "inset 0 0 0 1px var(--border-subtle)",
                opacity: 0,
                gridColumn: (i % COLS) + 1,
                gridRow: Math.floor(i / COLS) + 1,
              }}
              onMouseEnter={(e) => {
                const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                const parent = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect();
                setHover({
                  date: c.date,
                  count: c.count,
                  x: r.left - parent.left + r.width / 2,
                  y: r.top - parent.top,
                });
              }}
              onMouseLeave={() => setHover(null)}
            />
          );
        })}

        {/* Tooltip */}
        {hover && (
          <div
            className="pointer-events-none absolute -translate-x-1/2 -translate-y-full px-2 py-1 rounded-md text-[10px] font-mono tabular-nums z-10"
            style={{
              left: hover.x,
              top: hover.y - 4,
              background: "var(--bg-primary)",
              color: "var(--text-primary)",
              boxShadow:
                "0 4px 14px rgba(10, 10, 30, 0.18), 0 0 0 1px var(--border-subtle)",
            }}
          >
            <div className="font-bold">{hover.count} txn{hover.count === 1 ? "" : "s"}</div>
            <div className="text-text-muted text-[9px]">{hover.date}</div>
          </div>
        )}
      </div>

      {/* Footer legend */}
      <div className="flex items-center gap-2 mt-3 text-[9px] text-text-muted">
        <span>less</span>
        <span className="inline-flex gap-0.5">
          {[0.05, 0.15, 0.35, 0.65, 1].map((alpha, i) => (
            <span
              key={i}
              className="size-2.5 rounded-sm"
              style={{ background: `rgba(255, 45, 156, ${alpha})` }}
            />
          ))}
        </span>
        <span>more</span>
        <span className="ml-auto">
          {totalTxns > 0
            ? `${(activeDays / DAYS * 100).toFixed(0)}% of days active`
            : "no on-chain activity in this window"}
        </span>
      </div>
    </div>
  );
}
