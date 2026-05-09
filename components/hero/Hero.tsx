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

export function Hero() {
  // Baseline BPM is driven by current Solana market heat (avg abs 24h % change
  // across the trending list). Hover and click apply transient overrides that
  // briefly push the rate up, then the heart settles back to whatever the
  // market is actually doing.
  const [marketBpm, setMarketBpm] = useState(55);
  const [transientBpm, setTransientBpm] = useState<number | null>(null);
  const bpm = transientBpm ?? marketBpm;
  const [sphereSize, setSphereSize] = useState(440);
  const heroRef = useRef<HTMLElement>(null);

  // Poll trending → heat → BPM. /api/trending is server-cached for 60s, so
  // the cost is essentially free.
  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      try {
        const r = await fetch("/api/trending", { cache: "no-store" });
        if (!r.ok) return;
        const json = (await r.json()) as { tokens: TrendingToken[] };
        if (cancelled) return;
        setMarketBpm(heatToBpm(computeHeat(json.tokens)));
      } catch {
        /* swallow */
      }
    };
    refresh();
    const id = setInterval(refresh, 45_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

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
      {/* Premium dot-grid backdrop unifies the two columns visually */}
      <div className="absolute inset-0 dot-grid pointer-events-none" aria-hidden />

      <div className="relative z-10 mx-auto max-w-[1280px] w-full px-6 lg:px-10 pt-10 lg:pt-16 pb-40">
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] gap-12 lg:gap-8 items-center">
          {/* LEFT — copy + trending */}
          <div className="flex flex-col items-start text-left order-2 lg:order-1">
            {/* Tiny "what is this" badge above the headline */}
            <div
              data-fade-up
              className="inline-flex items-center gap-2 px-2.5 py-1 mb-5 rounded-full text-[10.5px] font-bold uppercase tracking-[0.16em]"
              style={{
                background: "rgba(255, 45, 156, 0.08)",
                color: "#a01660",
                border: "1px solid rgba(255, 45, 156, 0.22)",
              }}
            >
              <span className="size-1.5 rounded-full bg-accent-pulse animate-pulse" />
              Block Valley · AI reasoning layer
            </div>

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
              Paste any contract. Get an{" "}
              <span className="text-text-primary font-semibold">
                AI-decoded read
              </span>{" "}
              — on-chain truth, X sentiment, and live catalysts in one paragraph.
              No more squinting at DEXScreener.
            </p>

            <div data-fade-up className="mt-10 hidden lg:block">
              <TrendingList limit={5} />
            </div>
          </div>

          {/* RIGHT — sphere */}
          <div className="relative flex items-center justify-center order-1 lg:order-2">
            <div
              data-sphere-in
              onMouseEnter={() => {
                // Transient lift on hover — push 12 BPM above the market baseline,
                // capped so we don't blow past the badge's "Hot" threshold gratuitously.
                setTransientBpm(Math.min(85, marketBpm + 12));
              }}
              onMouseLeave={() => setTransientBpm(null)}
            >
              <PulseSphere size={sphereSize} bpm={bpm} />
            </div>
            {/* Floating BPM badge — beats with the actual sphere rhythm */}
            <div
              data-fade-up
              className="absolute bottom-4 sm:bottom-6 right-4 sm:right-6 lg:right-2"
            >
              <HeartbeatBadge bpm={bpm} />
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
            // Submit spike — quick excitement, then back to market baseline.
            setTransientBpm(kind === "valid" ? 130 : 78);
            setTimeout(() => setTransientBpm(null), 2200);
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
