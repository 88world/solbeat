"use client";

import { useEffect, useRef, useState } from "react";
import { animate } from "animejs";
import type { BondingCurveSnapshot } from "@/lib/data/pumpfun";
import { humanizeNumber } from "@/lib/utils";

type Props = {
  ca: string;
};

/**
 * Pump.fun bonding-curve progress card. Renders ONLY when the token has
 * an active pump.fun bonding curve PDA — non-pump tokens get null and the
 * card is hidden by the parent.
 *
 * Why this card exists: pump.fun tokens trade against a bonding curve
 * until ~85 SOL flows in / ~793M tokens sell. At that moment liquidity
 * migrates to PumpSwap or Raydium, fees structure changes, and the
 * trading dynamics shift hard. Knowing where on the curve a token sits
 * is THE pump-degen scan. Photon, Axiom, BullX all surface this; we
 * didn't until now.
 *
 * Data path: client polls /api/token/[ca]/pump every 12s. Fast — single
 * Helius getAccountInfo for the bonding curve PDA, no AI calls.
 */
export function BondingCurveCard({ ca }: Props) {
  const [data, setData] = useState<BondingCurveSnapshot | null>(null);
  const [error, setError] = useState(false);
  const [secondsAgo, setSecondsAgo] = useState(0);
  // Lazy initializer — `Date.now()` is impure in render, but inside
  // the `() => …` form it only fires once on mount, which is what we
  // want for "when did the last tick happen?".
  const [lastTick, setLastTick] = useState(() => Date.now());
  const numberRef = useRef<HTMLSpanElement>(null);
  const lastDisplayedRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      try {
        const r = await fetch(`/api/token/${ca}/pump`, { cache: "no-store" });
        if (!r.ok) {
          if (!cancelled) setError(true);
          return;
        }
        const json = (await r.json()) as {
          curve: BondingCurveSnapshot | null;
        };
        if (cancelled) return;
        setData(json.curve);
        setLastTick(Date.now());
        setError(false);
      } catch {
        if (!cancelled) setError(true);
      }
    };
    refresh();
    const id = setInterval(refresh, 12_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [ca]);

  useEffect(() => {
    const id = setInterval(() => {
      setSecondsAgo(Math.floor((Date.now() - lastTick) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [lastTick]);

  // Animate the % number when it changes.
  useEffect(() => {
    if (!data || !numberRef.current) return;
    const target = data.progress_pct;
    const obj = { v: lastDisplayedRef.current };
    const a = animate(obj, {
      v: target,
      duration: 900,
      ease: "out(3)",
      onUpdate: () => {
        if (numberRef.current) {
          numberRef.current.textContent = obj.v.toFixed(1);
        }
        lastDisplayedRef.current = obj.v;
      },
    });
    return () => {
      a.pause();
    };
  }, [data?.progress_pct]);

  // No render for non-pump tokens.
  if (error || data === null) return null;

  const pct = data.progress_pct;
  const isGraduated = data.graduated;

  if (isGraduated) {
    return (
      <div
        className="rounded-2xl px-5 py-4 mb-5 flex items-center justify-between gap-4 relative overflow-hidden"
        style={{
          background:
            "linear-gradient(135deg, rgba(20, 241, 149, 0.10) 0%, rgba(20, 241, 149, 0.05) 100%)",
          border: "1px solid rgba(20, 241, 149, 0.22)",
        }}
      >
        <div className="flex items-center gap-3">
          <span className="text-[16px]" aria-hidden>
            🎓
          </span>
          <div>
            <div className="text-[11px] uppercase tracking-[0.20em] font-bold text-text-muted mb-0.5">
              Pump.fun · graduated
            </div>
            <div className="text-[14px] font-bold text-text-primary leading-tight">
              Migrated. Trades on PumpSwap / Raydium now.
            </div>
          </div>
        </div>
        <div
          className="text-[26px] font-mono font-black tabular-nums"
          style={{ color: "#0a8f57" }}
        >
          100%
        </div>
      </div>
    );
  }

  // Tier coloring: closer to graduation = warmer color (more attention).
  // 99.5%+ but not flagged complete = curve is empty, migration tx is on
  // the way. That deserves its own urgent label.
  const tier =
    pct >= 99.5
      ? { bg: "rgba(255, 45, 156, 0.20)", border: "rgba(255, 45, 156, 0.40)", color: "#c1374a", label: "Migrating now" }
      : pct >= 90
        ? { bg: "rgba(255, 45, 156, 0.16)", border: "rgba(255, 45, 156, 0.30)", color: "#c1374a", label: "Almost migrating" }
        : pct >= 70
          ? { bg: "rgba(255, 139, 45, 0.14)", border: "rgba(255, 139, 45, 0.30)", color: "#d6601a", label: "Heating up" }
          : pct >= 40
            ? { bg: "rgba(255, 185, 56, 0.12)", border: "rgba(255, 185, 56, 0.28)", color: "#a3680a", label: "Mid-curve" }
            : { bg: "rgba(94, 92, 255, 0.10)", border: "rgba(94, 92, 255, 0.22)", color: "#5e5cff", label: "Early curve" };

  return (
    <div
      className="rounded-2xl px-5 py-4 mb-5 relative overflow-hidden"
      style={{
        background: tier.bg,
        border: `1px solid ${tier.border}`,
      }}
    >
      <div className="flex items-baseline justify-between mb-3 gap-3 flex-wrap">
        <div>
          <div className="text-[10px] uppercase tracking-[0.20em] font-bold text-text-muted mb-1">
            Pump.fun · bonding curve
            <span className="ml-2 text-[9px] uppercase tracking-[0.16em] text-text-muted opacity-70">
              {secondsAgo < 5 ? "live · just now" : `${secondsAgo}s ago`}
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span
              ref={numberRef}
              className="text-[36px] font-black text-mono tabular-nums leading-none tracking-tight"
              style={{ color: tier.color }}
            >
              {pct.toFixed(1)}
            </span>
            <span
              className="text-[18px] font-bold leading-none"
              style={{ color: tier.color }}
            >
              %
            </span>
            <span className="text-[11.5px] text-text-muted ml-1.5">
              to migration
            </span>
          </div>
        </div>
        <div className="text-right">
          <div
            className="text-[10.5px] uppercase tracking-[0.18em] font-bold mb-0.5"
            style={{ color: tier.color }}
          >
            {tier.label}
          </div>
          <div className="text-[11px] text-text-muted text-mono tabular-nums">
            {humanizeNumber(data.tokens_sold)} / {humanizeNumber(796_900_000)} sold
          </div>
        </div>
      </div>

      {/* Progress bar. Animates width with a soft ease. */}
      <div
        className="relative h-2.5 rounded-full overflow-hidden"
        style={{ background: "rgba(10, 10, 30, 0.06)" }}
      >
        <div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{
            width: `${pct.toFixed(2)}%`,
            background: `linear-gradient(90deg, ${tier.color}55, ${tier.color})`,
            boxShadow: `0 0 12px ${tier.color}66`,
            transition: "width 800ms cubic-bezier(0.22, 1, 0.36, 1)",
          }}
        />
      </div>

      <div className="flex items-baseline justify-between mt-2.5 text-[10.5px] text-text-muted gap-2">
        <span className="text-mono">
          <span className="font-bold text-text-secondary text-mono">
            {data.sol_in_curve.toFixed(2)}
          </span>{" "}
          SOL in curve
        </span>
        <span className="text-mono">
          <span className="font-bold text-text-secondary text-mono">
            {humanizeNumber(data.tokens_left)}
          </span>{" "}
          tokens left to migrate
        </span>
      </div>
    </div>
  );
}
