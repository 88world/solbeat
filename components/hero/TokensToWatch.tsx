"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import type { TrendingToken } from "@/types/token";
import { humanizeNumber } from "@/lib/utils";

/**
 * Tokens to Watch — recently-graduated pump.fun tokens in the post-launch
 * survival band (500K–1.5M mcap, 24h–14d old, ≥45% buy share). 99% of
 * pump.fun launches rug within 24h of graduation; the survivors that
 * make it into this band with buyers in control are the actual run
 * candidates.
 *
 * This is the differentiator math the user asked for. Every other tool
 * shows you "trending" (whatever's hot RIGHT NOW). We show you what's
 * about to be trending — the band where alpha exists before the herd.
 */
const REFRESH_MS = 30_000;

export function TokensToWatch() {
  const [tokens, setTokens] = useState<TrendingToken[]>([]);
  const [loading, setLoading] = useState(true);
  // Wall-clock of the last successful refresh so the countdown ring can
  // draw based on elapsed time rather than a separately-ticking counter
  // that could drift out of sync with the actual fetch cadence.
  const [lastRefresh, setLastRefresh] = useState(() => Date.now());
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      // Background-tab gate.
      if (document.hidden) return;
      try {
        const r = await fetch("/api/watch", { cache: "no-store" });
        if (!r.ok) return;
        const json = (await r.json()) as { tokens: TrendingToken[] };
        if (cancelled) return;
        setTokens(json.tokens ?? []);
        setLoading(false);
        setLastRefresh(Date.now());
      } catch {
        if (!cancelled) setLoading(false);
      }
    };
    refresh();
    const id = setInterval(refresh, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  // Tick once per second to drive the countdown. Cheap, doesn't trigger
  // network or AnimatePresence re-flow, only this header re-renders.
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const elapsed = Math.min(REFRESH_MS, nowMs - lastRefresh);
  const secondsToNext = Math.max(0, Math.ceil((REFRESH_MS - elapsed) / 1000));
  const progress = elapsed / REFRESH_MS; // 0..1

  return (
    <div
      className="rounded-2xl p-5 sm:p-6"
      style={{
        background: "var(--glass-medium)",
        backdropFilter: "blur(20px) saturate(160%)",
        WebkitBackdropFilter: "blur(20px) saturate(160%)",
        border: "1px solid rgba(10, 10, 30, 0.06)",
        boxShadow: "0 6px 18px rgba(10, 10, 30, 0.04)",
      }}
    >
      <div className="flex items-baseline justify-between mb-4 flex-wrap gap-2">
        <div>
          <h3 className="text-[14px] font-bold tracking-tight text-text-primary">
            Tokens to watch
          </h3>
          <p className="text-[11.5px] text-text-secondary mt-0.5 leading-relaxed">
            Recently-graduated pump.fun tokens in the survival band ·{" "}
            <span className="text-mono">$500K–$1.5M mcap</span> ·{" "}
            <span className="text-mono">≥45% buy share</span>
          </p>
        </div>
        <RefreshIndicator
          progress={progress}
          secondsToNext={secondsToNext}
        />
      </div>

      {loading ? (
        <SkeletonGrid />
      ) : tokens.length === 0 ? (
        <div className="rounded-xl px-4 py-6 text-center bg-text-muted/[0.04] text-[12px] text-text-secondary">
          No tokens currently meet the watch criteria. Check back in a few
          minutes.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
          <AnimatePresence>
            {tokens.map((t, i) => (
              <WatchCard key={t.ca} token={t} index={i} />
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

/**
 * Tiny SVG ring that fills clockwise as the refresh interval elapses.
 * When ≤3s remain, the dot pulses pink so a glance reads "about to update";
 * the rest of the time it stays muted so it doesn't compete with the data.
 */
function RefreshIndicator({
  progress,
  secondsToNext,
}: {
  progress: number;
  secondsToNext: number;
}) {
  const r = 6.5;
  const c = 2 * Math.PI * r;
  const dashOffset = c * (1 - Math.min(1, progress));
  const imminent = secondsToNext <= 3;
  const stroke = imminent ? "#FF2D9C" : "#8a8a9e";
  const label = imminent ? `refreshing in ${secondsToNext}s` : `alpha · ${secondsToNext}s`;

  return (
    <span className="inline-flex items-center gap-1.5">
      <svg
        width={18}
        height={18}
        viewBox="0 0 18 18"
        className={imminent ? "animate-pulse" : undefined}
        aria-hidden
      >
        <circle
          cx="9"
          cy="9"
          r={r}
          fill="none"
          stroke="currentColor"
          strokeOpacity={0.18}
          strokeWidth={1.4}
        />
        <circle
          cx="9"
          cy="9"
          r={r}
          fill="none"
          stroke={stroke}
          strokeWidth={1.6}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={dashOffset}
          transform="rotate(-90 9 9)"
          style={{ transition: "stroke-dashoffset 0.9s linear, stroke 250ms ease" }}
        />
      </svg>
      <span
        className="text-[10px] uppercase tracking-[0.18em] font-bold tabular-nums"
        style={{ color: imminent ? "#FF2D9C" : undefined }}
      >
        {label}
      </span>
    </span>
  );
}

function WatchCard({ token, index }: { token: TrendingToken; index: number }) {
  const change24 = token.price_change_24h ?? 0;
  const positive = change24 >= 0;
  const symbol = (token.symbol ?? "—").toUpperCase().replace(/^\$/, "");
  const ageHours = token.pair_age_hours ?? 0;
  const ageStr =
    ageHours < 24
      ? `${Math.round(ageHours)}h`
      : `${Math.round(ageHours / 24)}d`;
  const buys = token.txns_24h_buys ?? 0;
  const sells = token.txns_24h_sells ?? 0;
  const total = buys + sells;
  const buyShare = total > 0 ? (buys / total) * 100 : 0;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{
        type: "spring",
        stiffness: 240,
        damping: 26,
        delay: index * 0.05,
      }}
      whileHover={{
        y: -2,
        transition: { type: "spring", stiffness: 320, damping: 22 },
      }}
    >
      <Link
        href={`/token/${token.ca}`}
        className="block rounded-xl p-3 transition-all relative overflow-hidden"
        style={{
          background:
            "linear-gradient(180deg, var(--bg-glass), var(--glass-soft))",
          boxShadow:
            "inset 0 0 0 1px rgba(10, 10, 30, 0.06), 0 4px 12px rgba(10, 10, 30, 0.04)",
        }}
      >
        {/* Buy-pressure side stripe */}
        <div
          aria-hidden
          className="absolute left-0 top-0 bottom-0 w-[3px]"
          style={{
            background: `linear-gradient(180deg, rgba(20, 241, 149, ${(buyShare / 100) * 0.85}), rgba(20, 241, 149, 0.20))`,
          }}
        />

        <div className="flex items-center gap-2.5 mb-2.5 relative">
          <span
            className="size-9 rounded-lg overflow-hidden bg-white shrink-0 flex items-center justify-center"
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
              <span className="text-[10px] text-text-muted font-bold">
                {symbol.slice(0, 3)}
              </span>
            )}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-1.5">
              <span className="text-[13px] font-bold text-text-primary truncate tracking-tight">
                ${symbol}
              </span>
              <span className="text-[9.5px] text-text-muted text-mono shrink-0">
                {ageStr}
              </span>
            </div>
            <div className="text-[10.5px] text-text-muted text-mono truncate">
              ${humanizeNumber(token.market_cap ?? token.fdv ?? 0)} mcap
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-1.5 text-[10px] relative">
          <Stat
            label="24h"
            value={`${positive ? "+" : ""}${change24.toFixed(0)}%`}
            color={positive ? "#0a8f57" : "#c1374a"}
          />
          <Stat
            label="Buys"
            value={`${buyShare.toFixed(0)}%`}
            color="#0a8f57"
          />
          <Stat
            label="Vol"
            value={`$${humanizeNumber(token.volume_24h ?? 0)}`}
          />
        </div>
      </Link>
    </motion.div>
  );
}

function Stat({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div className="rounded-md bg-text-muted/[0.04] px-1.5 py-1">
      <div className="text-[8.5px] uppercase tracking-[0.14em] text-text-muted font-bold">
        {label}
      </div>
      <div
        className="text-[10.5px] font-mono font-bold tabular-nums leading-none mt-0.5 truncate"
        style={{ color: color ?? "#0a0a14" }}
      >
        {value}
      </div>
    </div>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="rounded-xl p-3 animate-shimmer h-[100px]"
          style={{
            background: "var(--glass-soft)",
            boxShadow: "inset 0 0 0 1px rgba(10, 10, 30, 0.05)",
          }}
        />
      ))}
    </div>
  );
}
