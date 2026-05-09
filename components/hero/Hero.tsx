"use client";

import { useEffect, useRef, useState } from "react";
import { animate, stagger } from "animejs";
import { PulseSphere } from "./PulseSphere";
import { TrendingRing } from "./TrendingRing";
import { CaPasteBox } from "./CaPasteBox";
import { AmbientOrbs } from "./AmbientOrbs";

export function Hero() {
  const [bpm, setBpm] = useState(50);
  const [ringRadius, setRingRadius] = useState(360);
  const [sphereSize, setSphereSize] = useState(220);
  const heroRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const compute = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      // Sphere stays modest. Ring radius adapts to whichever is smaller (w/h).
      const reach = Math.min(w, h);
      if (w < 480) {
        setSphereSize(140);
        setRingRadius(Math.max(140, reach * 0.36));
      } else if (w < 768) {
        setSphereSize(180);
        setRingRadius(Math.max(220, reach * 0.34));
      } else if (w < 1100) {
        setSphereSize(220);
        setRingRadius(Math.max(280, reach * 0.32));
      } else {
        setSphereSize(240);
        setRingRadius(Math.min(380, reach * 0.32));
      }
    };
    compute();
    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
  }, []);

  // Anime.js entrance choreography
  useEffect(() => {
    const root = heroRef.current;
    if (!root) return;

    animate(root.querySelectorAll("[data-fade-up]"), {
      opacity: [0, 1],
      translateY: [16, 0],
      duration: 700,
      delay: stagger(120, { start: 100 }),
      ease: "out(3)",
    });
    animate(root.querySelectorAll("[data-sphere-in]"), {
      opacity: [0, 1],
      scale: [0.8, 1],
      duration: 1200,
      delay: 50,
      ease: "out(4)",
    });
    animate(root.querySelectorAll("[data-ticker-in]"), {
      opacity: [0, 1],
      scale: [0.5, 1],
      duration: 700,
      delay: stagger(40, { start: 400, from: "first" }),
      ease: "out(3)",
    });
  }, []);

  return (
    <section
      ref={heroRef}
      className="relative w-full overflow-hidden"
      style={{ minHeight: "calc(100svh - 64px)" }}
    >
      <AmbientOrbs />

      {/* Sphere + ring as the centerpiece visual layer (behind content) */}
      <div
        className="absolute inset-0 flex items-center justify-center pointer-events-none"
        aria-hidden
      >
        <div className="relative">
          <TrendingRing radius={ringRadius} />
          <div
            data-sphere-in
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
            onMouseEnter={() => setBpm(78)}
            onMouseLeave={() => setBpm(50)}
            style={{ pointerEvents: "auto" }}
          >
            <PulseSphere size={sphereSize} bpm={bpm} />
          </div>
        </div>
      </div>

      {/* Foreground content: headline anchored top, CTA anchored bottom */}
      <div
        className="relative z-10 flex flex-col items-center justify-between min-h-[calc(100svh-64px)] px-4 sm:px-6 py-16 sm:py-20 pointer-events-none"
      >
        <div className="text-center max-w-3xl pointer-events-auto">
          <h1
            data-fade-up
            className="font-semibold tracking-[-0.04em] leading-[1.02] text-[clamp(2rem,4.6vw,3.75rem)]"
            style={{ textShadow: "0 0 30px rgba(10, 10, 15, 0.85)" }}
          >
            <span className="text-text-primary">The pulse of every</span>
            <br />
            <span className="bg-gradient-to-r from-accent-pulse via-accent-primary to-accent-secondary bg-clip-text text-transparent">
              Solana token
            </span>
            <span className="text-text-secondary font-light italic">
              {" "}— in plain English.
            </span>
          </h1>
          <p
            data-fade-up
            className="mt-3 text-text-muted text-[12px] sm:text-[13px]"
          >
            On-chain data + X sentiment + recent catalysts, synthesized by AI in one paragraph.
          </p>
        </div>

        {/* Spacer so the sphere area between headline and CTA stays empty */}
        <div className="flex-1" />

        <div
          className="w-full max-w-[640px] pointer-events-auto"
          data-fade-up
        >
          <CaPasteBox
            onPulse={(kind) => {
              if (kind === "valid") setBpm(120);
              else setBpm(72);
              setTimeout(() => setBpm(50), 1200);
            }}
          />
          <p className="mt-3.5 text-center text-[11.5px] text-text-muted">
            try{" "}
            <TickerHint />
            {" "}or paste any contract address
          </p>
        </div>
      </div>
    </section>
  );
}

const HINT_TICKERS = ["$BONK", "$WIF", "$JUP", "$POPCAT", "$JTO", "$PYTH"] as const;

function TickerHint() {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setIdx((i) => (i + 1) % HINT_TICKERS.length), 2200);
    return () => clearInterval(id);
  }, []);
  return (
    <span
      key={idx}
      className="text-text-secondary font-medium animate-fade-in inline-block"
    >
      {HINT_TICKERS[idx]}
    </span>
  );
}
