"use client";

import { useEffect, useRef, useState } from "react";
import { animate, stagger } from "animejs";
import { PulseSphere } from "./PulseSphere";
import { TrendingList } from "./TrendingList";
import { CaPasteBox } from "./CaPasteBox";
import { AmbientOrbs } from "./AmbientOrbs";

export function Hero() {
  const [bpm, setBpm] = useState(50);
  const [sphereSize, setSphereSize] = useState(440);
  const heroRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const compute = () => {
      const w = window.innerWidth;
      if (w < 480) setSphereSize(280);
      else if (w < 768) setSphereSize(360);
      else if (w < 1100) setSphereSize(380);
      else if (w < 1440) setSphereSize(440);
      else setSphereSize(500);
    };
    compute();
    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
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

      <div className="relative z-10 mx-auto max-w-[1280px] w-full px-6 lg:px-10 pt-10 lg:pt-16 pb-40">
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] gap-12 lg:gap-8 items-center">
          {/* LEFT — copy + trending */}
          <div className="flex flex-col items-start text-left order-2 lg:order-1">
            <h1
              data-fade-up
              className="font-extrabold tracking-[-0.04em] leading-[1.04] text-text-primary text-[clamp(2.4rem,5.4vw,4.5rem)]"
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
              Real-time contract analysis, on-chain data, and social sentiment.
              Drop a CA — see the data breathe.
            </p>

            <div data-fade-up className="mt-10 hidden lg:block">
              <TrendingList limit={5} />
            </div>
          </div>

          {/* RIGHT — sphere */}
          <div className="relative flex items-center justify-center order-1 lg:order-2">
            <div
              data-sphere-in
              onMouseEnter={() => setBpm(80)}
              onMouseLeave={() => setBpm(50)}
            >
              <PulseSphere size={sphereSize} bpm={bpm} />
            </div>
          </div>
        </div>

        {/* Mobile-only trending below the sphere */}
        <div data-fade-up className="lg:hidden mt-10 flex justify-center">
          <TrendingList limit={4} />
        </div>
      </div>

      {/* Bottom-anchored search */}
      <div
        data-fade-up
        className="absolute left-0 right-0 bottom-6 sm:bottom-10 px-6 z-20"
      >
        <CaPasteBox
          onPulse={(kind) => {
            if (kind === "valid") setBpm(160);
            else setBpm(80);
            setTimeout(() => setBpm(50), 2500);
          }}
        />
        <p className="mt-3.5 text-center text-[11px] sm:text-[12px] text-text-muted">
          try{" "}
          <TickerHint />
          {" "}or paste any contract · ⌘V from anywhere
        </p>
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
