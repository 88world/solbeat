"use client";

import { useEffect, useRef, useState } from "react";
import { animate, stagger } from "animejs";
import Link from "next/link";
import type { TrendingToken } from "@/types/token";
import { humanizeNumber, pctChange } from "@/lib/utils";

/**
 * Vertical trending list — replaces the orbital ring with something readable.
 * Each row: avatar (logo or gradient fallback) + symbol + name + % change.
 * Slide-up entrance with anime.js stagger once data lands.
 *
 * Optional `heat` prop (0..1) — when the market gets hot, the live indicator
 * dot shifts from brand pink to Solana green to reinforce the sphere's signal.
 */
export function TrendingList({
  limit = 5,
  heat = 0,
}: {
  limit?: number;
  heat?: number;
}) {
  const [tokens, setTokens] = useState<TrendingToken[]>([]);
  const rootRef = useRef<HTMLDivElement>(null);
  const animatedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const r = await fetch("/api/trending", { cache: "no-store" });
        if (!r.ok) return;
        const json = (await r.json()) as { tokens: TrendingToken[] };
        if (!cancelled) setTokens(json.tokens.slice(0, limit));
      } catch {
        /* swallow */
      }
    };
    load();
    const id = setInterval(load, 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [limit]);

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
      <div className="flex flex-col gap-2">
        {tokens.length === 0
          ? Array.from({ length: limit }).map((_, i) => <SkeletonRow key={i} />)
          : tokens.map((t) => <TrendingRow key={t.ca} token={t} />)}
      </div>
    </div>
  );
}

function TrendingRow({ token }: { token: TrendingToken }) {
  const symbol = (token.symbol ?? "").replace(/^\$/, "").toUpperCase();
  const change = token.price_change_24h ?? 0;
  const positive = change >= 0;
  return (
    <Link
      href={`/token/${token.ca}`}
      data-trend-row
      className="group relative flex items-center justify-between gap-3 px-3 py-2.5 rounded-2xl border border-border-subtle bg-bg-elevated/55 backdrop-blur-md hover:bg-bg-elevated/85 hover:border-border-emphasized hover:-translate-y-0.5 transition-all duration-300 overflow-hidden"
      style={{
        boxShadow: "0 1px 0 rgba(255,255,255,0.5) inset, 0 6px 20px rgba(10, 10, 30, 0.04)",
      }}
    >
      <div
        aria-hidden
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
        style={{
          background:
            "linear-gradient(110deg, rgba(255,45,156,0.06), rgba(94,92,255,0.06))",
        }}
      />
      <div className="relative flex items-center gap-3 min-w-0">
        <Avatar image={token.image} symbol={symbol} />
        <div className="flex flex-col min-w-0">
          <span className="text-[13px] font-semibold text-text-primary tracking-tight truncate">
            {symbol}
          </span>
          <span className="text-[11px] font-medium text-text-muted truncate">
            {token.name ?? "—"}
            {token.volume_24h != null && (
              <>
                {" · "}vol ${humanizeNumber(token.volume_24h, 1)}
              </>
            )}
          </span>
        </div>
      </div>
      <div
        className={`relative font-mono text-[12.5px] font-semibold shrink-0 ${
          positive ? "text-signal-positive" : "text-signal-negative"
        }`}
      >
        {pctChange(change)}
      </div>
    </Link>
  );
}

function Avatar({
  image,
  symbol,
}: {
  image: string | null;
  symbol: string;
}) {
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
    <div className="flex items-center justify-between px-3 py-2.5 rounded-2xl border border-border-subtle">
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
