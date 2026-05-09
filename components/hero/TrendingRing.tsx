"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { TrendingToken } from "@/types/token";
import { pctChange } from "@/lib/utils";

type Props = {
  radius?: number;
};

export function TrendingRing({ radius = 360 }: Props) {
  const [tokens, setTokens] = useState<TrendingToken[]>([]);
  const [paused, setPaused] = useState(false);

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

  const count = tokens.length;
  const ringStyle: React.CSSProperties = {
    width: radius * 2,
    height: radius * 2,
    animationPlayState: paused ? "paused" : "running",
  };

  return (
    <div
      className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
      style={{ width: radius * 2, height: radius * 2 }}
    >
      {/* Background concentric rings */}
      <svg
        className="absolute inset-0"
        width="100%"
        height="100%"
        viewBox={`0 0 ${radius * 2} ${radius * 2}`}
        aria-hidden
      >
        <defs>
          <radialGradient id="ring-glow" cx="50%" cy="50%" r="50%">
            <stop offset="60%" stopColor="rgba(153,69,255,0)" />
            <stop offset="85%" stopColor="rgba(153,69,255,0.10)" />
            <stop offset="100%" stopColor="rgba(153,69,255,0)" />
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
          r={radius - 60}
          fill="none"
          stroke="rgba(255,255,255,0.05)"
          strokeWidth="1"
          strokeDasharray="2 6"
        />
        <circle cx={radius} cy={radius} r={radius} fill="url(#ring-glow)" />
      </svg>

      {/* Rotating tickers */}
      <div
        className="absolute inset-0 pointer-events-auto"
        style={{
          ...ringStyle,
          animation: "orbit 60s linear infinite",
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
                className="absolute group"
                style={{
                  left: x,
                  top: y,
                  transform: "translate(-50%, -50%)",
                }}
              >
                <div
                  className="flex flex-col items-center gap-1 transition-all"
                  style={{
                    animation: "orbit-reverse 60s linear infinite",
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
        <div
          className="absolute inset-0 pointer-events-none flex items-center justify-center"
          aria-hidden
        >
          {/* Show 12 placeholder dots while loading */}
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
  return (
    <div className="flex items-center gap-1.5 px-2.5 py-1 glass rounded-full text-[11px] font-medium hover:scale-110 transition-transform shadow-[0_4px_24px_rgba(0,0,0,0.4)]">
      <span className="text-text-primary">${token.symbol}</span>
      <span
        className={
          positive ? "text-signal-positive text-[10px]" : "text-signal-negative text-[10px]"
        }
      >
        {pctChange(change)}
      </span>
    </div>
  );
}
