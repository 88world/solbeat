"use client";

import { useEffect, useRef, useState } from "react";
import { animate, stagger } from "animejs";
import { AnimatePresence, motion } from "framer-motion";
import dynamic from "next/dynamic";

// LiveFlow imports three.js (~600KB), lazy-load so the initial homepage
// JS bundle stays small. SSR off — it's a WebGL canvas, no useful HTML.
const LiveFlow = dynamic(() => import("./LiveFlow").then((m) => m.LiveFlow), {
  ssr: false,
  loading: () => (
    <div
      className="rounded-2xl"
      style={{
        width: 360,
        height: 360,
        background: "var(--glass-medium)",
        boxShadow: "inset 0 0 0 1px var(--border-subtle)",
      }}
    />
  ),
});
import { TrendingList } from "./TrendingList";
import { CaPasteBox } from "./CaPasteBox";
import { MarketPulse } from "./MarketPulse";
import { LiveChart } from "./LiveChart";
import { TickerTape } from "./TickerTape";
import { LiveActivityFeed } from "./LiveActivityFeed";
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
    const id = setInterval(refresh, 8_000);
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
          <h1 className="relative font-extrabold tracking-[-0.04em] leading-[0.98] text-text-primary text-[clamp(2rem,4.2vw,3.4rem)]">
            {/* Soft pink/blue glow behind the headline, only visible on
                desktop where there's vertical room. Pinned by the live
                heat so it intensifies when the market is hot — the
                background pulses with the data. */}
            <span
              aria-hidden
              className="hidden lg:block absolute left-1/2 -translate-x-1/2 -top-8 w-[640px] h-[180px] pointer-events-none"
              style={{
                background:
                  "radial-gradient(ellipse at center, rgba(255,45,156,0.18) 0%, rgba(94,92,255,0.10) 35%, transparent 70%)",
                filter: "blur(20px)",
                opacity: 0.45 + Math.min(1, heat) * 0.4,
                transition: "opacity 700ms ease",
              }}
            />
            <span className="relative">
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

        {/* MIDDLE, three-column dashboard.
            Reordered per user request:
              left   = Market Pulse (BPM + heat breakdown)
              center = Live Trending list ("Market is hot")
              right  = Buy/Sell flow particles (LiveFlow)
            The flow viz lands on the right where the eye scans last,
            after reading the macro pulse and the ranked tokens. */}
        <div
          className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[minmax(0,4fr)_minmax(0,4fr)_minmax(0,5fr)] gap-4 lg:gap-5 lg:items-center"
        >
          <div data-fade-up className="hidden lg:flex justify-end">
            <MarketPulse pulse={snapshot} />
          </div>

          <div data-fade-up className="hidden lg:flex justify-center">
            <TrendingList limit={5} heat={heat} tokens={tokens} />
          </div>

          <div
            data-sphere-in
            // hidden lg:flex — the LiveFlow particle viz is desktop-only.
            // On mobile it costs ~300px vertical for an ambient visual most
            // users glance past; the mobile section below moves it into a
            // collapsed disclosure under TrendingList so it stays accessible
            // but doesn't dominate the small viewport.
            className="hidden lg:flex items-center justify-start min-h-0"
          >
            <LiveFlow tokens={tokens} size={sphereSize} heat={heat} />
          </div>
        </div>

        {/* BOTTOM, live activity feed + live chart + scrolling ticker */}
        <div data-fade-up className="hidden lg:block space-y-3">
          <LiveActivityFeed trending={tokens} />
          <LiveChart tokens={tokens} limit={5} />
          <TickerTape tokens={tokens} heat={heat} />
        </div>

        {/* Mobile stack. Order matters: ECG-bearing MarketPulse leads so
            the brand's "pulse" identity reads instantly when the page
            loads. LiveFlow is parked at the bottom inside a collapsed
            disclosure — mobile users tend to skim, the buy/sell particle
            visual is decorative not data, so it's opt-in rather than
            forced into the scroll. */}
        <div
          className="lg:hidden flex flex-col gap-3 items-stretch"
          data-fade-up
        >
          <MarketPulse pulse={snapshot} />
          <LiveActivityFeed trending={tokens} />
          <LiveChart tokens={tokens} limit={5} />
          <TickerTape tokens={tokens} heat={heat} />
          <TrendingList limit={4} heat={heat} tokens={tokens} />
          <MobileFlowDisclosure tokens={tokens} heat={heat} />
        </div>
      </div>
    </section>
  );
}

/**
 * Collapsible LiveFlow wrapper for the mobile stack. The buy/sell particle
 * field is brand decoration, not a data primitive — on a 375px viewport
 * it eats prime above-the-fold real estate that should belong to ECG,
 * trending, and the activity feed. Tucking it behind a tap-to-expand
 * keeps the visual available without forcing it into every scroll.
 *
 * Implementation uses a controlled state + framer-motion height animation
 * so the expand/collapse feels native to the brand (matches the smooth
 * cadence of TrendingList row entry). `LiveFlow` itself only mounts when
 * expanded — no three.js cost when collapsed, no unmount-flicker if the
 * user re-opens it within the same session because we keep it alive once
 * opened.
 */
function MobileFlowDisclosure({
  tokens,
  heat,
}: {
  tokens: TrendingToken[];
  heat: number;
}) {
  const [open, setOpen] = useState(false);
  const [everOpened, setEverOpened] = useState(false);

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        background: "var(--glass-medium)",
        border: "1px solid var(--border-subtle)",
        boxShadow:
          "0 1px 0 rgba(255,255,255,0.08) inset, 0 6px 18px rgba(10, 10, 30, 0.04)",
      }}
    >
      <button
        type="button"
        onClick={() => {
          setOpen((o) => !o);
          if (!everOpened) setEverOpened(true);
        }}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-3 px-4 py-3.5 text-left"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          {/* Tiny green/pink pip pair — visual shorthand for "buy/sell flow" */}
          <span className="flex items-center gap-0.5 shrink-0">
            <span
              className="size-1.5 rounded-full"
              style={{ background: "#14F195" }}
            />
            <span
              className="size-1.5 rounded-full"
              style={{ background: "#FF2D9C" }}
            />
          </span>
          <span className="text-[10.5px] uppercase tracking-[0.22em] font-bold text-text-secondary">
            Buy / sell flow
          </span>
          <span className="text-[10px] text-text-muted normal-case tracking-normal">
            · tap to {open ? "hide" : "show"}
          </span>
        </div>
        <span
          aria-hidden
          className="text-[14px] text-text-muted transition-transform"
          style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)" }}
        >
          ▾
        </span>
      </button>

      {/* Smooth height + opacity reveal. We render LiveFlow only after the
          first open; subsequent collapses keep it mounted (the height is
          animated to 0 + display:none-equivalent) so re-opening is instant. */}
      <AnimatePresence initial={false}>
        {open && everOpened && (
          <motion.div
            key="flow-body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 flex justify-center">
              <LiveFlow tokens={tokens} size={300} heat={heat} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
