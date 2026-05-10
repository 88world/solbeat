"use client";

import { useEffect, useRef, useState } from "react";
import { animate, stagger } from "animejs";
import { TrendingTreemap } from "./TrendingTreemap";
import { TrendingList } from "./TrendingList";
import { CaPasteBox } from "./CaPasteBox";
import { MarketPulse } from "./MarketPulse";
import { LiveChart } from "./LiveChart";
import { TickerTape } from "./TickerTape";
import {
  computeHeatSnapshot,
  heatToBpm,
  type HeatSnapshot,
} from "@/lib/utils/heat";
import type { TrendingToken } from "@/types/token";

const SUBMIT_VALID_HEAT = 0.95;
const SUBMIT_INVALID_HEAT = 0.4;
const TRANSIENT_MS = 2400;

export function Hero() {
  const [snapshot, setSnapshot] = useState<HeatSnapshot | null>(null);
  const [transientHeat, setTransientHeat] = useState<number | null>(null);
  const heat = transientHeat ?? snapshot?.heat ?? 0.2;
  const bpm = heatToBpm(heat);

  const [sphereSize, setSphereSize] = useState(280);
  const heroRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const compute = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      // Treemap centerpiece is data-dense, give it more canvas than the
      // abstract sphere had. We want each tile readable at a glance.
      let target: number;
      if (w < 480) target = 240;
      else if (w < 768) target = 280;
      else if (w < 1100) target = 320;
      else if (w < 1440) target = 360;
      else target = 380;
      target = Math.min(target, Math.floor(h * 0.45));
      setSphereSize(target);
    };
    compute();
    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
  }, []);

  // Single trending fetch, feeds MarketPulse, TrendingList, and LiveChart.
  // Polled at 15s so the LiveChart fills with real samples quickly.
  const [tokens, setTokens] = useState<TrendingToken[]>([]);
  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      try {
        const r = await fetch("/api/trending", { cache: "no-store" });
        if (!r.ok) return;
        const json = (await r.json()) as {
          tokens: TrendingToken[];
          sol?: import("@/lib/data/dexscreener").SolMacro | null;
        };
        if (cancelled) return;
        setTokens(json.tokens);
        setSnapshot(computeHeatSnapshot(json.tokens, json.sol ?? null));
      } catch {
        /* swallow */
      }
    };
    refresh();
    const id = setInterval(refresh, 15_000);
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
        translateY: [14, 0],
        duration: 700,
        delay: stagger(70, { start: 60 }),
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
      style={{ minHeight: "calc(100svh - 64px)" }}
    >
      <div className="absolute inset-0 dot-grid pointer-events-none" aria-hidden />

      <div className="relative z-10 mx-auto max-w-[1320px] w-full h-full px-5 lg:px-8 py-4 lg:py-6 flex flex-col gap-4 lg:gap-5">
        {/* TOP, centered headline + paste box */}
        <div
          className="flex flex-col items-center text-center gap-3 lg:gap-4"
          data-fade-up
        >
          <h1 className="font-extrabold tracking-[-0.04em] leading-[0.98] text-text-primary text-[clamp(2rem,4.2vw,3.4rem)]">
            The pulse{" "}
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
          <div className="w-full max-w-lg">
            <CaPasteBox
              heat={heat}
              onPulse={(kind) => {
                const targetHeat =
                  kind === "valid" ? SUBMIT_VALID_HEAT : SUBMIT_INVALID_HEAT;
                setTransientHeat(targetHeat);
                setTimeout(() => setTransientHeat(null), TRANSIENT_MS);
              }}
            />
          </div>
        </div>

        {/* MIDDLE, three-column dashboard */}
        <div
          className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[minmax(0,4fr)_minmax(0,5fr)_minmax(0,4fr)] gap-4 lg:gap-5 lg:items-center"
        >
          <div data-fade-up className="hidden lg:flex justify-end">
            <MarketPulse pulse={snapshot} />
          </div>

          <div
            data-sphere-in
            className="flex items-center justify-center min-h-0"
          >
            <TrendingTreemap tokens={tokens} size={sphereSize} heat={heat} />
          </div>

          <div data-fade-up className="hidden lg:flex justify-start">
            <TrendingList limit={5} heat={heat} tokens={tokens} />
          </div>
        </div>

        {/* BOTTOM, live chart + scrolling ticker */}
        <div data-fade-up className="hidden lg:block space-y-3">
          <LiveChart tokens={tokens} limit={5} />
          <TickerTape tokens={tokens} />
        </div>

        {/* Mobile stack: pulse, trending, chart below the sphere */}
        <div
          className="lg:hidden flex flex-col gap-3 items-stretch"
          data-fade-up
        >
          <MarketPulse pulse={snapshot} />
          <LiveChart tokens={tokens} limit={5} />
          <TickerTape tokens={tokens} />
          <TrendingList limit={4} heat={heat} tokens={tokens} />
        </div>
      </div>
    </section>
  );
}
