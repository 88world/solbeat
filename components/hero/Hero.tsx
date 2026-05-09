"use client";

import { useEffect, useRef, useState } from "react";
import { animate, stagger } from "animejs";
import { PulseSphere } from "./PulseSphere";
import { TrendingList } from "./TrendingList";
import { CaPasteBox } from "./CaPasteBox";
import { AmbientOrbs } from "./AmbientOrbs";
import { MarketPulse } from "./MarketPulse";
import { computeHeatSnapshot, type HeatSnapshot } from "@/lib/utils/heat";
import type { TrendingToken } from "@/types/token";

const SUBMIT_VALID_HEAT = 0.95;
const SUBMIT_INVALID_HEAT = 0.4;
const TRANSIENT_MS = 2400;

export function Hero() {
  const [snapshot, setSnapshot] = useState<HeatSnapshot | null>(null);
  const [transientHeat, setTransientHeat] = useState<number | null>(null);
  const heat = transientHeat ?? snapshot?.heat ?? 0.2;

  const [sphereSize, setSphereSize] = useState(360);
  const heroRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const compute = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      let target: number;
      if (w < 480) target = 240;
      else if (w < 768) target = 280;
      else if (w < 1100) target = 300;
      else if (w < 1440) target = 340;
      else target = 380;
      target = Math.min(target, Math.floor(h * 0.50));
      setSphereSize(target);
    };
    compute();
    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
  }, []);

  // Single trending fetch — used by both the heat snapshot and the trending list
  // (passed down via prop).
  const [tokens, setTokens] = useState<TrendingToken[]>([]);
  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      try {
        const r = await fetch("/api/trending", { cache: "no-store" });
        if (!r.ok) return;
        const json = (await r.json()) as { tokens: TrendingToken[] };
        if (cancelled) return;
        setTokens(json.tokens);
        setSnapshot(computeHeatSnapshot(json.tokens));
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
        translateY: [16, 0],
        duration: 700,
        delay: stagger(80, { start: 80 }),
        ease: "out(3)",
      });
    }
    const sphereIn = root.querySelectorAll("[data-sphere-in]");
    if (sphereIn.length) {
      animate(sphereIn, {
        opacity: [0, 1],
        scale: [0.88, 1],
        duration: 1100,
        delay: 120,
        ease: "out(4)",
      });
    }
  }, []);

  return (
    <section
      ref={heroRef}
      className="relative w-full overflow-hidden"
      style={{ minHeight: "calc(100svh - 64px)", maxHeight: "calc(100svh - 64px)" }}
    >
      <AmbientOrbs />
      <div className="absolute inset-0 dot-grid pointer-events-none" aria-hidden />

      <div className="relative z-10 mx-auto max-w-[1240px] w-full h-full px-6 lg:px-10 py-5 lg:py-7 flex flex-col">
        {/* TOP — paste box */}
        <div data-fade-up className="mb-3 lg:mb-4 shrink-0">
          <CaPasteBox
            heat={heat}
            onPulse={(kind) => {
              const targetHeat =
                kind === "valid" ? SUBMIT_VALID_HEAT : SUBMIT_INVALID_HEAT;
              setTransientHeat(targetHeat);
              setTimeout(() => setTransientHeat(null), TRANSIENT_MS);
            }}
          />
          <p className="mt-2 text-center text-[11px] text-text-muted">
            try{" "}
            <TickerHint />
            {" "}or paste any contract · ⌘V from anywhere
          </p>
        </div>

        {/* BODY — two-column */}
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] gap-5 lg:gap-7 items-center flex-1 min-h-0">
          {/* LEFT: headline + market pulse + trending */}
          <div className="flex flex-col items-start text-left order-2 lg:order-1 min-h-0 gap-4">
            <div data-fade-up>
              <h1 className="font-extrabold tracking-[-0.04em] leading-[1.02] text-text-primary text-[clamp(1.7rem,3.4vw,2.75rem)]">
                The pulse
                <br />
                <span
                  className="inline-block bg-clip-text text-transparent text-shimmer pb-0.5"
                  style={{
                    backgroundImage:
                      "linear-gradient(110deg, #FF2D9C 0%, #5E5CFF 35%, #14F195 70%, #FF2D9C 100%)",
                  }}
                >
                  of Solana.
                </span>
              </h1>
              <p className="mt-2 text-text-secondary text-[12.5px] sm:text-[13px] leading-relaxed max-w-md font-medium">
                Token intel decoded by AI — on-chain, social, and live catalysts in one read.
              </p>
            </div>

            <div data-fade-up className="hidden lg:block w-full">
              <MarketPulse pulse={snapshot} />
            </div>

            <div data-fade-up className="hidden lg:block w-full">
              <TrendingList limit={3} heat={heat} tokens={tokens} />
            </div>
          </div>

          {/* RIGHT: sphere */}
          <div className="relative flex items-center justify-center order-1 lg:order-2">
            <div data-sphere-in>
              <PulseSphere size={sphereSize} heat={heat} />
            </div>
          </div>
        </div>

        {/* Mobile-only stack */}
        <div className="lg:hidden mt-5 flex flex-col gap-4 items-center" data-fade-up>
          <MarketPulse pulse={snapshot} />
          <TrendingList limit={3} heat={heat} tokens={tokens} />
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
      4000,
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
