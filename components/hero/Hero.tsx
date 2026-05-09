"use client";

import { useEffect, useRef, useState } from "react";
import { animate, stagger } from "animejs";
import { PulseSphere } from "./PulseSphere";
import { TrendingList } from "./TrendingList";
import { CaPasteBox } from "./CaPasteBox";
import { AmbientOrbs } from "./AmbientOrbs";
import { HeartbeatBadge } from "./HeartbeatBadge";
import { computeHeat, heatToBpm } from "@/lib/utils/heat";
import type { TrendingToken } from "@/types/token";

const HOVER_HEAT_LIFT = 0.12;
const SUBMIT_VALID_HEAT = 0.95;
const SUBMIT_INVALID_HEAT = 0.4;
const TRANSIENT_MS = 2400;

export function Hero() {
  const [marketHeat, setMarketHeat] = useState(0.2);
  const [transientHeat, setTransientHeat] = useState<number | null>(null);
  const [transientBpm, setTransientBpm] = useState<number | null>(null);
  const heat = transientHeat ?? marketHeat;
  const bpm = transientBpm ?? heatToBpm(Math.min(1, heat));

  const [sphereSize, setSphereSize] = useState(440);
  const heroRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const compute = () => {
      const w = window.innerWidth;
      if (w < 480) setSphereSize(280);
      else if (w < 768) setSphereSize(340);
      else if (w < 1100) setSphereSize(380);
      else if (w < 1440) setSphereSize(440);
      else setSphereSize(500);
    };
    compute();
    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
  }, []);

  // Poll trending → heat. Cached server-side for 60s, browser polls every 30s.
  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      try {
        const r = await fetch("/api/trending", { cache: "no-store" });
        if (!r.ok) return;
        const json = (await r.json()) as { tokens: TrendingToken[] };
        if (cancelled) return;
        setMarketHeat(computeHeat(json.tokens));
      } catch {
        /* swallow */
      }
    };
    refresh();
    const id = setInterval(refresh, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  // Entrance choreography
  useEffect(() => {
    const root = heroRef.current;
    if (!root) return;

    const fadeUp = root.querySelectorAll("[data-fade-up]");
    if (fadeUp.length) {
      animate(fadeUp, {
        opacity: [0, 1],
        translateY: [18, 0],
        duration: 800,
        delay: stagger(110, { start: 80 }),
        ease: "out(3)",
      });
    }
    const sphereIn = root.querySelectorAll("[data-sphere-in]");
    if (sphereIn.length) {
      animate(sphereIn, {
        opacity: [0, 1],
        scale: [0.85, 1],
        duration: 1300,
        delay: 100,
        ease: "out(4)",
      });
    }
  }, []);

  return (
    <section
      ref={heroRef}
      className="relative w-full overflow-hidden"
      style={{ minHeight: "calc(100svh - 64px)" }}
    >
      <AmbientOrbs />
      <div className="absolute inset-0 dot-grid pointer-events-none" aria-hidden />

      <div className="relative z-10 mx-auto max-w-[1280px] w-full px-6 lg:px-10 pt-8 lg:pt-10 pb-12">
        {/* TOP — paste box, the action sits above the fold */}
        <div data-fade-up className="mb-10 lg:mb-14">
          <CaPasteBox
            heat={heat}
            onPulse={(kind) => {
              const targetHeat =
                kind === "valid" ? SUBMIT_VALID_HEAT : SUBMIT_INVALID_HEAT;
              const targetBpm = kind === "valid" ? 130 : 78;
              setTransientHeat(targetHeat);
              setTransientBpm(targetBpm);
              setTimeout(() => {
                setTransientHeat(null);
                setTransientBpm(null);
              }, TRANSIENT_MS);
            }}
          />
          <p className="mt-3.5 text-center text-[11.5px] text-text-muted">
            try{" "}
            <TickerHint />
            {" "}or paste any contract · ⌘V from anywhere
          </p>
        </div>

        {/* TWO-COLUMN — copy + trending left, sphere right */}
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] gap-12 lg:gap-8 items-center">
          {/* LEFT */}
          <div className="flex flex-col items-start text-left order-2 lg:order-1">
            <h1
              data-fade-up
              className="font-extrabold tracking-[-0.04em] leading-[1.02] text-text-primary text-[clamp(2.4rem,5.4vw,4.5rem)]"
            >
              The pulse
              <br />
              <span
                className="inline-block bg-clip-text text-transparent text-shimmer pb-1"
                style={{
                  backgroundImage:
                    "linear-gradient(110deg, #FF2D9C 0%, #5E5CFF 35%, #14F195 70%, #FF2D9C 100%)",
                }}
              >
                of Solana.
              </span>
            </h1>
            <p
              data-fade-up
              className="mt-5 text-text-secondary text-[15px] sm:text-[16px] leading-relaxed max-w-md font-medium"
            >
              Token intel decoded by AI — on-chain, social, and live catalysts
              in one read.
            </p>

            <div data-fade-up className="mt-10 hidden lg:block">
              <TrendingList limit={5} heat={heat} />
            </div>
          </div>

          {/* RIGHT */}
          <div className="relative flex items-center justify-center order-1 lg:order-2">
            <div
              data-sphere-in
              onMouseEnter={() =>
                setTransientHeat(Math.min(1, marketHeat + HOVER_HEAT_LIFT))
              }
              onMouseLeave={() => setTransientHeat(null)}
            >
              <PulseSphere size={sphereSize} heat={heat} />
            </div>
            <div
              data-fade-up
              className="absolute bottom-2 sm:bottom-4 right-2 sm:right-4 lg:right-2"
            >
              <HeartbeatBadge bpm={bpm} />
            </div>
          </div>
        </div>

        {/* Mobile-only trending below the sphere */}
        <div data-fade-up className="lg:hidden mt-10 flex justify-center">
          <TrendingList limit={4} heat={heat} />
        </div>
      </div>
    </section>
  );
}

const HINT_TICKERS = ["$BONK", "$WIF", "$JUP", "$POPCAT", "$JTO", "$PYTH"] as const;

function TickerHint() {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const id = setInterval(
      () => setIdx((i) => (i + 1) % HINT_TICKERS.length),
      2200,
    );
    return () => clearInterval(id);
  }, []);
  return (
    <span
      key={idx}
      className="text-text-secondary font-semibold animate-fade-in inline-block"
    >
      {HINT_TICKERS[idx]}
    </span>
  );
}
