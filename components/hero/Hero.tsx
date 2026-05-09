"use client";

import { useEffect, useState } from "react";
import { PulseSphere } from "./PulseSphere";
import { TrendingRing } from "./TrendingRing";
import { CaPasteBox } from "./CaPasteBox";

export function Hero() {
  const [bpm, setBpm] = useState(50);
  const [ringRadius, setRingRadius] = useState(360);
  const [sphereSize, setSphereSize] = useState(300);

  useEffect(() => {
    const compute = () => {
      const w = window.innerWidth;
      if (w < 480) {
        setRingRadius(160);
        setSphereSize(180);
      } else if (w < 768) {
        setRingRadius(240);
        setSphereSize(220);
      } else if (w < 1100) {
        setRingRadius(320);
        setSphereSize(280);
      } else {
        setRingRadius(380);
        setSphereSize(320);
      }
    };
    compute();
    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
  }, []);

  return (
    <section className="relative w-full min-h-[calc(100svh-72px)] overflow-hidden flex items-center justify-center">
      {/* Trending ring */}
      <TrendingRing radius={ringRadius} />

      {/* Pulse sphere centered, paste box overlapping */}
      <div className="relative z-10 flex flex-col items-center gap-6 sm:gap-8">
        <div
          className="relative"
          onMouseEnter={() => setBpm(78)}
          onMouseLeave={() => setBpm(50)}
        >
          <PulseSphere size={sphereSize} bpm={bpm} />
        </div>

        <div className="w-[92vw] sm:w-auto">
          <CaPasteBox
            onPulse={(kind) => {
              if (kind === "valid") setBpm(120);
              else setBpm(72);
              setTimeout(() => setBpm(50), 1200);
            }}
          />
        </div>

        <div className="text-center max-w-md px-4">
          <p className="text-[13px] sm:text-[14px] text-text-secondary leading-relaxed">
            The pulse of every Solana token, in plain English.
            <br />
            <span className="text-text-muted text-[12px]">
              Paste a contract address. We do the squinting for you.
            </span>
          </p>
        </div>
      </div>
    </section>
  );
}
