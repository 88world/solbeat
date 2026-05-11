"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { animate } from "animejs";
import type { TrendingToken } from "@/types/token";
import { humanizeNumber } from "@/lib/utils";

/**
 * Stock-ticker-style scrolling marquee. Pure anime.js for the infinite scroll
 * loop, no CSS keyframes, so we can pause on hover, vary speed by heat, and
 * later wire transient highlights for fresh price prints.
 *
 * The trick for a seamless loop: render the token list TWICE side by side,
 * then translate the track from 0 → -50% over the loop duration. When the
 * first set has scrolled fully out of view, the second set is in the same
 * position the first started in, so the transition is invisible.
 */
export function TickerTape({
  tokens,
  speedMs,
  heat = 0,
}: {
  tokens: TrendingToken[];
  /**
   * Override the auto-computed speed. Leave undefined to derive from heat:
   * slower when the market is quiet (60s/loop), faster when everything is
   * pumping (28s/loop). Lower number = faster scroll.
   */
  speedMs?: number;
  /** 0..1 heat score. Higher heat = faster scroll, more "the floor is alive". */
  heat?: number;
}) {
  // Heat-driven cadence. At heat=0 the ticker drifts at a calm 60s/loop;
  // at heat=1 it's at 28s/loop, fast enough to feel hectic without
  // becoming unreadable. Explicit `speedMs` override wins so callers can
  // still pin a speed if they want.
  //
  // CRITICAL: `resolvedSpeed` MUST NOT be in the useEffect deps. Heat
  // updates every poll (~8s), shifting resolvedSpeed by a few ms each
  // time. If we re-ran the effect, anime would tear down + recreate the
  // animation, snapping translateX back to 0 — to the user that looked
  // like the ticker was frozen. We capture the initial value here and
  // expose a ref for future loop iterations to read updated values from
  // (anime v4 evaluates function values on each iteration).
  const resolvedSpeed = speedMs ?? Math.round(60_000 - Math.min(1, heat) * 32_000);
  const speedRef = useRef(resolvedSpeed);
  speedRef.current = resolvedSpeed;
  const trackRef = useRef<HTMLDivElement>(null);
  const setRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<{ pause: () => void; play: () => void } | null>(null);

  useEffect(() => {
    const track = trackRef.current;
    const oneSet = setRef.current;
    if (!track || !oneSet || tokens.length === 0) return;

    // Measure ONE set's actual width including the trailing gap, then
    // translate by exactly that. -50% only works if both halves render
    // identically including their bordering whitespace, which they don't
    // when the track has padding or the LIVE pip eats real space. Measuring
    // the rendered width sidesteps the seam-mismatch problem entirely.
    let setWidth = oneSet.getBoundingClientRect().width;

    // Re-measure on resize so the loop continues to land cleanly.
    const ro = new ResizeObserver(() => {
      setWidth = oneSet.getBoundingClientRect().width;
    });
    ro.observe(oneSet);

    const a = animate(track, {
      // anime.js accepts pixel translations directly. Going from 0 to
      // -setWidth means the second set lands EXACTLY where the first
      // started, then we loop and continue. Function value gets
      // re-evaluated on each loop iteration, so resize stays accurate.
      translateX: () => [`0px`, `${-setWidth}px`],
      // Duration also a function so future heat changes are picked up
      // on the next loop iteration without rebuilding the animation.
      duration: () => speedRef.current,
      ease: "linear",
      loop: true,
    });
    animationRef.current = a as unknown as {
      pause: () => void;
      play: () => void;
    };

    return () => {
      a.pause();
      ro.disconnect();
    };
    // Only re-run when the token list itself changes (length differs).
    // Speed lives in a ref so heat ticks don't tear down the animation.
  }, [tokens.length]);

  if (tokens.length === 0) return null;

  return (
    <div
      className="relative overflow-hidden rounded-2xl"
      style={{
        background:
          "linear-gradient(90deg, var(--glass-medium) 0%, var(--glass-soft) 50%, var(--glass-medium) 100%)",
        backdropFilter: "blur(20px) saturate(160%)",
        WebkitBackdropFilter: "blur(20px) saturate(160%)",
        border: "1px solid rgba(10, 10, 30, 0.06)",
        boxShadow: "0 6px 18px rgba(10, 10, 30, 0.04)",
      }}
      onMouseEnter={() => animationRef.current?.pause()}
      onMouseLeave={() => animationRef.current?.play()}
    >
      {/* Edge-fade masks. Items appear and disappear into the bg instead
          of getting clipped at a hard edge. Bumped to w-28 (112px) and
          opaque-up to 60% so items can't peek out behind the LIVE pip. */}
      <div
        className="absolute inset-y-0 left-0 w-28 z-[10] pointer-events-none"
        style={{
          background:
            "linear-gradient(90deg, var(--bg-primary) 0%, var(--bg-primary) 60%, transparent 100%)",
        }}
      />
      <div
        className="absolute inset-y-0 right-0 w-20 z-[10] pointer-events-none"
        style={{
          background:
            "linear-gradient(270deg, var(--bg-primary) 0%, var(--bg-primary) 30%, transparent 100%)",
        }}
      />

      {/* "LIVE" pip on the left edge. Sits on top of the mask (z-20) with
          a SOLID glass background so no scrolling text bleeds through. */}
      <div
        className="absolute left-3 top-1/2 -translate-y-1/2 z-20 flex items-center gap-2 px-2.5 py-1 rounded-full"
        style={{
          background: "var(--glass-frost)",
          boxShadow:
            "inset 0 0 0 1px rgba(255, 45, 156, 0.35), 0 2px 6px rgba(255, 45, 156, 0.12)",
        }}
      >
        <span className="relative flex">
          <span
            className="absolute inset-0 size-2 rounded-full animate-ping"
            style={{ background: "#FF2D9C", opacity: 0.6 }}
          />
          <span
            className="relative size-2 rounded-full"
            style={{ background: "#FF2D9C" }}
          />
        </span>
        <span className="text-[9.5px] uppercase tracking-[0.20em] font-bold text-text-primary">
          Live
        </span>
      </div>

      {/* Track holds two side-by-side identical sets. Each set is its own
          flex container so we can measure ONE set's width precisely (via
          setRef) and translate the track by that exact pixel amount —
          guarantees a seamless loop regardless of font metrics, image
          load timing, or container padding. */}
      <div
        ref={trackRef}
        className="flex items-center py-3 pl-32"
        style={{ width: "fit-content", willChange: "transform" }}
      >
        <div ref={setRef} className="flex items-center gap-6 pr-6">
          {tokens.map((t) => (
            <TickerItem key={`a-${t.ca}`} token={t} />
          ))}
        </div>
        <div className="flex items-center gap-6 pr-6">
          {tokens.map((t) => (
            <TickerItem key={`b-${t.ca}`} token={t} />
          ))}
        </div>
      </div>
    </div>
  );
}

function TickerItem({ token }: { token: TrendingToken }) {
  const change = token.price_change_24h ?? 0;
  const positive = change >= 0;
  const color = positive ? "#0a8f57" : "#c1374a";
  const symbol = (token.symbol ?? "—").toUpperCase().replace(/^\$/, "");

  return (
    <Link
      href={`/token/${token.ca}`}
      className="group inline-flex items-center gap-2.5 px-3 py-1 rounded-lg transition shrink-0"
      style={{ minWidth: "max-content" }}
    >
      <span
        className="size-6 rounded-md overflow-hidden bg-white shrink-0 flex items-center justify-center"
        style={{ boxShadow: "inset 0 0 0 1px rgba(10, 10, 30, 0.06)" }}
      >
        {token.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={token.image}
            alt={symbol}
            className="size-full object-cover"
            referrerPolicy="no-referrer"
            loading="lazy"
          />
        ) : (
          <span className="text-[8.5px] text-text-muted font-bold">
            {symbol.slice(0, 3)}
          </span>
        )}
      </span>
      <span className="text-[13px] font-bold tracking-tight text-text-primary group-hover:text-accent-pulse transition">
        ${symbol}
      </span>
      {/* Market cap, what degens actually scan for. Falls back to FDV
          when self-reported mcap is missing (most fresh launches). */}
      <span className="text-[12.5px] font-mono text-text-secondary">
        ${humanizeNumber(token.market_cap ?? token.fdv ?? 0)}
        <span className="ml-1 text-[9px] uppercase tracking-[0.14em] text-text-muted font-bold">
          mc
        </span>
      </span>
      <span
        className="text-[12px] font-semibold font-mono"
        style={{ color }}
      >
        {positive ? "+" : ""}
        {change.toFixed(change >= 100 || change <= -100 ? 0 : 2)}%
      </span>
    </Link>
  );
}
