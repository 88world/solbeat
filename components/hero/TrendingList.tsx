"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { animate, stagger } from "animejs";
import Link from "next/link";
import type { TrendingToken } from "@/types/token";
import { humanizeNumber, pctChange } from "@/lib/utils";

const ROTATE_INTERVAL_MS = 4500;

/**
 * Vertical trending list, auto-rotates through the trending pool every 4.5s.
 * Newest item slides in at the top with full opacity, older items fade as
 * they shift down (degen-feel: "what just popped"). Uses framer-motion's
 * AnimatePresence for clean enter/exit and an opacity ramp keyed by row index.
 *
 * Optional `heat` prop (0..1), when the market gets hot, the live indicator
 * dot shifts from BV pink to Solana green and the label updates.
 */
export function TrendingList({
  limit = 5,
  heat = 0,
  tokens: tokensProp,
}: {
  limit?: number;
  heat?: number;
  /** Optional, if provided, the list won't fetch on its own. Hero already does. */
  tokens?: TrendingToken[];
}) {
  const [tokensInternal, setTokensInternal] = useState<TrendingToken[]>([]);
  const tokens = tokensProp ?? tokensInternal;
  const [offset, setOffset] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const animatedRef = useRef(false);

  // Self-fetch only when no tokens prop is passed, keeps the component
  // standalone-capable while letting Hero deduplicate the network call.
  useEffect(() => {
    if (tokensProp) return;
    let cancelled = false;
    const load = async () => {
      try {
        const r = await fetch("/api/trending", { cache: "no-store" });
        if (!r.ok) return;
        const json = (await r.json()) as { tokens: TrendingToken[] };
        if (!cancelled) setTokensInternal(json.tokens);
      } catch {
        /* swallow */
      }
    };
    load();
    const id = setInterval(load, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [tokensProp]);

  // Auto-rotate the visible window, only when we have more than `limit` tokens
  useEffect(() => {
    if (tokens.length <= limit) return;
    const id = setInterval(() => {
      setOffset((o) => (o + 1) % tokens.length);
    }, ROTATE_INTERVAL_MS);
    return () => clearInterval(id);
  }, [tokens.length, limit]);

  // Initial entrance (anime.js stagger), fires once per page load
  useEffect(() => {
    if (animatedRef.current || tokens.length === 0) return;
    const root = rootRef.current;
    if (!root) return;
    const rows = root.querySelectorAll("[data-trend-row]");
    if (!rows.length) return;
    animatedRef.current = true;
    animate(rows, {
      opacity: [0, 1],
      translateY: [16, 0],
      duration: 600,
      delay: stagger(80, { start: 200 }),
      ease: "out(3)",
    });
  }, [tokens]);

  const visible = useMemo(() => {
    if (tokens.length === 0) return [];
    if (tokens.length <= limit) return tokens;
    return Array.from({ length: limit }, (_, i) => tokens[(offset + i) % tokens.length]);
  }, [tokens, offset, limit]);

  const isHot = heat >= 0.6;
  const dotColor = isHot ? "#14F195" : "#FF2D9C";
  const label = isHot ? "Live · market is hot" : "Live · trending now";

  return (
    <div ref={rootRef} className="w-full max-w-sm">
      <div className="flex items-center gap-2.5 mb-4">
        <span className="relative flex size-2">
          <span
            className="absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping transition-colors duration-1000"
            style={{ background: dotColor }}
          />
          <span
            className="relative inline-flex size-2 rounded-full transition-colors duration-1000"
            style={{ background: dotColor }}
          />
        </span>
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-text-secondary transition-colors">
          {label}
        </span>
      </div>

      <div className="relative flex flex-col gap-2">
        {visible.length === 0 ? (
          Array.from({ length: limit }).map((_, i) => <SkeletonRow key={i} />)
        ) : (
          <AnimatePresence initial={false} mode="popLayout">
            {visible.map((t, i) => {
              // Opacity ramps down as items move down the stack, top item is
              // the freshest/loudest, bottom item is fading out.
              const targetOpacity = 1 - i * 0.10;
              return (
                <motion.div
                  key={t.ca}
                  layout
                  data-trend-row
                  initial={{ opacity: 0, y: -14, filter: "blur(2px)" }}
                  animate={{ opacity: targetOpacity, y: 0, filter: "blur(0px)" }}
                  exit={{ opacity: 0, y: 14, filter: "blur(2px)" }}
                  transition={{
                    layout: { duration: 0.7, ease: [0.22, 1, 0.36, 1] },
                    opacity: { duration: 0.55, ease: [0.22, 1, 0.36, 1] },
                    y: { duration: 0.55, ease: [0.22, 1, 0.36, 1] },
                    filter: { duration: 0.55 },
                  }}
                >
                  <TrendingRow token={t} fresh={i === 0} />
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}

function TrendingRow({
  token,
  fresh,
}: {
  token: TrendingToken;
  fresh: boolean;
}) {
  const symbol = (token.symbol ?? "").replace(/^\$/, "").toUpperCase();
  const change = token.price_change_24h ?? 0;
  const positive = change >= 0;
  // Glow halo on the freshly-rotated top row. Fades over 1.4s after the
  // row is mounted (i.e., right after AnimatePresence finishes its enter
  // transition). The eye catches "something just changed" without us
  // having to draw an explicit "new!" label.
  const rowRef = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    if (!fresh) return;
    const el = rowRef.current;
    if (!el) return;
    const halo = positive ? "#14F195" : "#FF2D9C";
    animate(el, {
      boxShadow: [
        "0 1px 0 rgba(255,255,255,0.5) inset, 0 6px 20px rgba(10, 10, 30, 0.04)",
        `0 1px 0 rgba(255,255,255,0.5) inset, 0 0 0 1px ${halo}55, 0 6px 26px ${halo}55`,
        "0 1px 0 rgba(255,255,255,0.5) inset, 0 6px 20px rgba(10, 10, 30, 0.04)",
      ],
      duration: 1500,
      ease: "out(3)",
    });
  }, [fresh, positive, token.ca]);

  return (
    <Link
      ref={rowRef}
      href={`/token/${token.ca}`}
      className="group relative flex items-center justify-between gap-3 px-3.5 py-3 rounded-2xl border border-border-subtle bg-bg-elevated/55 backdrop-blur-md hover:bg-bg-elevated/85 hover:border-border-emphasized hover:-translate-y-0.5 transition-all duration-300 overflow-hidden"
      style={{
        boxShadow: "0 1px 0 rgba(255,255,255,0.5) inset, 0 6px 20px rgba(10, 10, 30, 0.04)",
      }}
    >
      {/* Hover glow */}
      <div
        aria-hidden
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
        style={{
          background:
            "linear-gradient(110deg, rgba(255,45,156,0.06), rgba(94,92,255,0.06))",
        }}
      />

      {/* Direction stripe, colored bar at the left edge */}
      <span
        aria-hidden
        className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-7 rounded-r-full"
        style={{
          background: positive ? "#14F195" : "#FF4757",
          opacity: Math.min(0.85, 0.3 + Math.abs(change) / 25),
        }}
      />

      <div className="relative flex items-center gap-3 min-w-0 pl-1">
        <Avatar image={token.image} symbol={symbol} />
        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[13px] font-semibold text-text-primary tracking-tight truncate">
              {symbol}
            </span>
            {fresh && (
              <span
                className="text-[8.5px] font-bold uppercase tracking-[0.12em] px-1.5 py-0.5 rounded-md"
                style={{
                  background: "rgba(255, 45, 156, 0.10)",
                  color: "#a01660",
                }}
              >
                fresh
              </span>
            )}
          </div>
          <span className="text-[11px] font-medium text-text-muted truncate">
            {token.name ?? "-"}
            {token.volume_24h != null && (
              <>
                {" · "}vol ${humanizeNumber(token.volume_24h, 1)}
              </>
            )}
          </span>
        </div>
      </div>

      <div
        className={`relative flex items-center gap-1 font-mono text-[12.5px] font-semibold shrink-0 ${
          positive ? "text-signal-positive" : "text-signal-negative"
        }`}
      >
        <span aria-hidden className="text-[10px]">
          {positive ? "▲" : "▼"}
        </span>
        {pctChange(change)}
      </div>
    </Link>
  );
}

function Avatar({ image, symbol }: { image: string | null; symbol: string }) {
  if (image) {
    return (
      <span className="relative size-9 rounded-xl overflow-hidden bg-white shrink-0 border border-border-subtle">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={image}
          alt=""
          className="size-full object-cover"
          referrerPolicy="no-referrer"
          loading="lazy"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = "none";
          }}
        />
      </span>
    );
  }
  return (
    <span
      className="size-9 rounded-xl shrink-0 flex items-center justify-center text-[12px] font-bold text-white"
      style={{
        background:
          "linear-gradient(135deg, #ff2d9c 0%, #5e5cff 60%, #14f195 100%)",
      }}
    >
      {symbol.slice(0, 1)}
    </span>
  );
}

function SkeletonRow() {
  return (
    <div className="flex items-center justify-between px-3.5 py-3 rounded-2xl border border-border-subtle">
      <div className="flex items-center gap-3">
        <div className="size-9 rounded-xl bg-text-muted/15 animate-shimmer" />
        <div className="space-y-1.5">
          <div className="h-3 w-16 rounded bg-text-muted/15 animate-shimmer" />
          <div className="h-2.5 w-24 rounded bg-text-muted/10 animate-shimmer" />
        </div>
      </div>
      <div className="h-3 w-12 rounded bg-text-muted/10 animate-shimmer" />
    </div>
  );
}
