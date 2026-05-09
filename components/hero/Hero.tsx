"use client";

import { useEffect, useState } from "react";
import { PulseSphere } from "./PulseSphere";
import { TrendingRing } from "./TrendingRing";
import { CaPasteBox } from "./CaPasteBox";
import { AmbientOrbs } from "./AmbientOrbs";

export function Hero() {
  const [bpm, setBpm] = useState(50);
  const [ringRadius, setRingRadius] = useState(380);
  const [sphereSize, setSphereSize] = useState(220);

  useEffect(() => {
    const compute = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      if (w < 480) {
        setRingRadius(150);
        setSphereSize(140);
      } else if (w < 768) {
        setRingRadius(240);
        setSphereSize(180);
      } else if (w < 1100) {
        setRingRadius(320);
        setSphereSize(200);
      } else {
        setRingRadius(Math.min(420, h * 0.42));
        setSphereSize(220);
      }
    };
    compute();
    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
  }, []);

  return (
    <section className="relative w-full min-h-[calc(100svh-64px)] overflow-hidden">
      <AmbientOrbs />

      {/* Trending ring sits in the background, orbiting the whole composition. */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <TrendingRing radius={ringRadius} />
      </div>

      {/* Foreground content — sphere, headline, paste box. */}
      <div className="relative z-10 flex flex-col items-center justify-center min-h-[calc(100svh-64px)] px-4 sm:px-6 gap-8 sm:gap-10">
        <div
          className="relative"
          onMouseEnter={() => setBpm(78)}
          onMouseLeave={() => setBpm(50)}
        >
          <PulseSphere size={sphereSize} bpm={bpm} />
          {/* Soft floor shadow under the sphere */}
          <div
            className="absolute left-1/2 -translate-x-1/2 -bottom-2 w-3/4 h-6 rounded-full pointer-events-none"
            style={{
              background:
                "radial-gradient(ellipse at center, rgba(255, 45, 156, 0.25), transparent 70%)",
              filter: "blur(8px)",
            }}
          />
        </div>

        <div className="text-center max-w-xl pointer-events-none">
          <h1 className="text-display text-text-primary">
            The pulse of every
            <br />
            <span className="bg-gradient-to-r from-accent-pulse via-accent-primary to-accent-secondary bg-clip-text text-transparent">
              Solana token
            </span>
            ,{" "}
            <span className="text-text-secondary font-normal italic">
              in plain English.
            </span>
          </h1>
        </div>

        <div className="w-full max-w-[640px]">
          <CaPasteBox
            onPulse={(kind) => {
              if (kind === "valid") setBpm(120);
              else setBpm(72);
              setTimeout(() => setBpm(50), 1200);
            }}
          />
          <p className="mt-4 text-center text-[12px] text-text-muted">
            Paste a contract address.
            <span className="hidden sm:inline">
              {" "}We do the squinting for you.
            </span>
          </p>
        </div>
      </div>
    </section>
  );
}
