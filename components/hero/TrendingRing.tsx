"use client";

import { useEffect, useRef, useState } from "react";
import { animate, stagger } from "animejs";
import Link from "next/link";
import type { TrendingToken } from "@/types/token";
import { pctChange } from "@/lib/utils";

type Props = {
  radius?: number;
};

export function TrendingRing({ radius = 380 }: Props) {
  const [tokens, setTokens] = useState<TrendingToken[]>([]);
  const [paused, setPaused] = useState(false);
  const ringRef = useRef<HTMLDivElement>(null);
  const animatedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const r = await fetch("/api/trending", { cache: "no-store" });
        if (!r.ok) return;
        const json = (await r.json()) as { tokens: TrendingToken[] };
        if (!cancelled) setTokens(json.tokens);
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
  }, []);

  // Entrance: stagger the chips into view once data lands. Runs once.
  useEffect(() => {
    if (animatedRef.current) return;
    if (tokens.length === 0) return;
    const root = ringRef.current;
    if (!root) return;
    const chips = root.querySelectorAll("[data-ticker-in]");
    if (!chips.length) return;
    animatedRef.current = true;
    animate(chips, {
      opacity: [0, 1],
      scale: [0.6, 1],
      duration: 700,
      delay: stagger(45, { start: 200 }),
      ease: "out(3)",
    });
  }, [tokens]);

  const count = tokens.length;
  const dim = radius * 2;

  return (
    <div
      ref={ringRef}
      className="relative pointer-events-none"
      style={{ width: dim, height: dim }}
    >
      {/* Concentric guides */}
      <svg
        className="absolute inset-0"
        width="100%"
        height="100%"
        viewBox={`0 0 ${dim} ${dim}`}
        aria-hidden
      >
        <defs>
          <radialGradient id="ring-glow" cx="50%" cy="50%" r="50%">
            <stop offset="62%" stopColor="rgba(153,69,255,0)" />
            <stop offset="86%" stopColor="rgba(153,69,255,0.05)" />
            <stop offset="100%" stopColor="rgba(255,45,156,0.04)" />
          </radialGradient>
        </defs>
        <circle
          cx={radius}
          cy={radius}
          r={radius - 1}
          fill="none"
          stroke="rgba(255,255,255,0.04)"
          strokeWidth="1"
        />
        <circle
          cx={radius}
          cy={radius}
          r={radius - 80}
          fill="none"
          stroke="rgba(255,255,255,0.04)"
          strokeWidth="1"
          strokeDasharray="2 8"
        />
        <circle cx={radius} cy={radius} r={radius} fill="url(#ring-glow)" />
      </svg>

      {/* Rotating tickers */}
      <div
        className="absolute inset-0 pointer-events-auto"
        style={{
          width: dim,
          height: dim,
          animation: "orbit 80s linear infinite",
          animationPlayState: paused ? "paused" : "running",
        }}
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
      >
        {count > 0 &&
          tokens.map((t, i) => {
            const angle = (i / count) * Math.PI * 2 - Math.PI / 2;
            const x = Math.cos(angle) * radius + radius;
            const y = Math.sin(angle) * radius + radius;
            return (
              <Link
                key={t.ca}
                href={`/token/${t.ca}`}
                className="absolute"
                style={{
                  left: x,
                  top: y,
                  transform: "translate(-50%, -50%)",
                }}
              >
                <div
                  data-ticker-in
                  style={{
                    animation: "orbit-reverse 80s linear infinite",
                    animationPlayState: paused ? "paused" : "running",
                  }}
                >
                  <TickerChip token={t} />
                </div>
              </Link>
            );
          })}
      </div>

      {count === 0 && (
        <div className="absolute inset-0 pointer-events-none" aria-hidden>
          {Array.from({ length: 12 }).map((_, i) => {
            const angle = (i / 12) * Math.PI * 2 - Math.PI / 2;
            const x = Math.cos(angle) * radius + radius;
            const y = Math.sin(angle) * radius + radius;
            return (
              <div
                key={i}
                className="absolute size-2 rounded-full bg-white/10"
                style={{ left: x, top: y, transform: "translate(-50%, -50%)" }}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function TickerChip({ token }: { token: TrendingToken }) {
  const change = token.price_change_24h ?? 0;
  const positive = change >= 0;
  const symbol = (token.symbol ?? "").replace(/^\$/, "").toUpperCase();
  return (
    <div
      className="group flex items-center gap-2 pl-1.5 pr-3 py-1.5 rounded-full border border-white/[0.08] hover:border-white/20 hover:scale-[1.06] hover:shadow-[0_8px_30px_rgba(255,45,156,0.22)] transition-all duration-300"
      style={{
        background: "rgba(18, 18, 26, 0.78)",
        backdropFilter: "blur(16px) saturate(140%)",
        WebkitBackdropFilter: "blur(16px) saturate(140%)",
        boxShadow: "0 4px 20px rgba(0, 0, 0, 0.55), inset 0 1px 0 rgba(255, 255, 255, 0.04)",
      }}
    >
      <TokenAvatar image={token.image} symbol={symbol} />
      <span className="text-[12px] font-semibold text-text-primary tracking-tight">
        {symbol}
      </span>
      <span
        className={`text-[10.5px] font-medium text-mono ${
          positive ? "text-signal-positive" : "text-signal-negative"
        }`}
      >
        {pctChange(change)}
      </span>
    </div>
  );
}

function TokenAvatar({
  image,
  symbol,
}: {
  image: string | null;
  symbol: string;
}) {
  if (image) {
    return (
      <span className="relative size-5 rounded-full overflow-hidden bg-white/5 shrink-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={image}
          alt=""
          className="size-full object-cover"
          referrerPolicy="no-referrer"
          loading="lazy"
          onError={(e) => {
            // Hide broken image; the gradient fallback below takes over via parent.
            (e.currentTarget as HTMLImageElement).style.display = "none";
          }}
        />
      </span>
    );
  }
  // Fallback: gradient orb with first letter of symbol.
  return (
    <span
      className="size-5 rounded-full shrink-0 flex items-center justify-center text-[8px] font-semibold text-white/90"
      style={{
        background:
          "linear-gradient(135deg, #ff2d9c 0%, #9945ff 50%, #14f195 100%)",
      }}
    >
      {symbol.slice(0, 1)}
    </span>
  );
}
