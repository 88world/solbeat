"use client";

import { useEffect, useRef } from "react";
import { animate } from "animejs";

type Props = {
  size?: number;
  /** Market heat (0..1). Drives palette + orbit speed + pulse intensity. */
  heat?: number;
  /** BPM for the heartbeat that pulses each blob's radius. */
  bpm?: number;
};

/**
 * The Pulse, take 3. Out: literal sphere with mesh.scale heartbeat.
 * In: liquid metaball blob. Six orbs orbiting in nested rings, blurred and
 * thresholded into a single mercury-style mass. Each orb pulses with the
 * BPM, the orbits turn at heat-scaled speeds, and the palette shifts from
 * cool indigo on flat days to hot pink on rippers.
 *
 * Why this shape:
 *   - Fluid by construction, the gooey filter forces continuous boundaries
 *     between every blob; you can't see the individual circles.
 *   - Organic motion, six different orbit periods means the silhouette is
 *     never the same twice.
 *   - Data-driven, BPM, heat, and pulse all map to visual properties.
 *   - No three.js shaders, no white-canvas bug, no GPU dependency. Pure
 *     SVG + CSS filter, runs at 60fps on a phone.
 *
 * anime.js is used for the heat→color transition so palette changes
 * cross-fade instead of snapping.
 */
export function PulseFluid({ size = 200, heat = 0.2, bpm }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const heatRef = useRef(heat);
  heatRef.current = heat;
  const bpmRef = useRef(bpm ?? 40 + heat * 160);
  bpmRef.current = bpm ?? 40 + heat * 160;

  // Per-blob refs so the rAF loop can mutate cx/cy/r without re-rendering.
  const blobRefs = useRef<Array<SVGCircleElement | null>>([]);
  // The colored gradient stops, animated via anime.js when heat shifts.
  const stopARef = useRef<SVGStopElement>(null);
  const stopBRef = useRef<SVGStopElement>(null);

  useEffect(() => {
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let raf = 0;
    const start = performance.now();

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const t = (now - start) / 1000; // seconds

      const h = heatRef.current;
      const bpm = bpmRef.current;
      const bps = bpm / 60;

      // Heartbeat envelope, smoothstep on top of sine so peaks/troughs are
      // soft. Drives radial pulse on every blob.
      const beatPhase = t * Math.PI * bps * 2;
      const beatRaw = (Math.sin(beatPhase) + 1) * 0.5;
      const beat = beatRaw * beatRaw * (3 - 2 * beatRaw);
      const breathing = reduced ? 0.3 : beat;

      // 6 blobs, each in its own orbit. Speeds, radii, and phase offsets
      // are coprime-ish so the silhouette evolves slowly without repeating.
      const cx = size / 2;
      const cy = size / 2;
      const heatBoost = 1 + h * 0.6;

      const orbits = ORBITS;
      for (let i = 0; i < orbits.length; i++) {
        const o = orbits[i];
        const el = blobRefs.current[i];
        if (!el) continue;

        // Orbit motion. Heat speeds the rotation.
        const angle = t * o.speed * heatBoost + o.phase;
        const radius = o.distance * size * (0.34 + h * 0.04);
        const x = cx + Math.cos(angle) * radius;
        // Slight vertical squash so the blob looks "fluid" rather than orbital.
        const y = cy + Math.sin(angle) * radius * 0.85;

        // Each blob's radius pulses with BPM, plus a slow per-blob breath.
        const baseR = o.radius * size;
        const pulse = breathing * o.pulseAmp;
        const slowBreath = Math.sin(t * o.breathSpeed + o.breathPhase) * 0.08;
        const r = baseR * (1 + pulse * 0.18 + slowBreath);

        el.setAttribute("cx", x.toFixed(2));
        el.setAttribute("cy", y.toFixed(2));
        el.setAttribute("r", r.toFixed(2));
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [size]);

  // Cross-fade gradient stops when heat changes. anime.js handles the
  // interpolation so big heat swings (e.g. quiet → ripping) animate smoothly
  // instead of popping. We target the stop-color attribute directly.
  useEffect(() => {
    const palette = pickPalette(heat);
    if (stopARef.current) {
      animate(stopARef.current, {
        // animejs v4 supports DOM attributes via the `targets`-less call form.
        // We pass the element directly.
        stopColor: palette.inner,
        duration: 1200,
        ease: "inOut(2)",
      });
    }
    if (stopBRef.current) {
      animate(stopBRef.current, {
        stopColor: palette.outer,
        duration: 1200,
        ease: "inOut(2)",
      });
    }
  }, [heat]);

  const initialPalette = pickPalette(heat);

  return (
    <div
      className="relative"
      style={{ width: size * 1.4, height: size * 1.4 }}
      aria-hidden
    >
      {/* Halo behind the blob. CSS, no JS, just sits there glowing. */}
      <div
        className="absolute inset-0 m-auto rounded-full pointer-events-none"
        style={{
          width: size * 1.25,
          height: size * 1.25,
          background:
            heat >= 0.6
              ? "radial-gradient(circle, rgba(255, 45, 156, 0.30) 0%, rgba(255, 139, 45, 0.16) 45%, transparent 75%)"
              : "radial-gradient(circle, rgba(94, 92, 255, 0.28) 0%, rgba(20, 241, 149, 0.12) 45%, transparent 75%)",
          filter: "blur(28px)",
          transition: "background 1200ms ease-out",
        }}
      />

      <svg
        ref={svgRef}
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="absolute inset-0 m-auto"
        style={{ overflow: "visible" }}
      >
        <defs>
          {/* Gooey filter, the engine of fluidity. Blur all the children, then
              apply a high-contrast color matrix that thresholds the alpha
              channel, anything above ~0.5 alpha becomes solid, the rest is
              cut. Result: separate circles merge into one continuous mass
              wherever they overlap. */}
          <filter id="pulse-fluid-goo" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="9" result="blur" />
            <feColorMatrix
              in="blur"
              mode="matrix"
              values="
                1 0 0 0 0
                0 1 0 0 0
                0 0 1 0 0
                0 0 0 22 -10
              "
              result="goo"
            />
            <feComposite in="SourceGraphic" in2="goo" operator="atop" />
          </filter>

          {/* Radial gradient inside the blobs. anime.js animates the stops
              when heat changes. */}
          <radialGradient id="pulse-fluid-grad" cx="50%" cy="48%" r="60%">
            <stop
              ref={stopARef}
              offset="0%"
              stopColor={initialPalette.inner}
            />
            <stop
              ref={stopBRef}
              offset="100%"
              stopColor={initialPalette.outer}
            />
          </radialGradient>
        </defs>

        <g filter="url(#pulse-fluid-goo)" fill="url(#pulse-fluid-grad)">
          {ORBITS.map((_, i) => (
            <circle
              key={i}
              ref={(el) => {
                blobRefs.current[i] = el;
              }}
              cx={size / 2}
              cy={size / 2}
              r={size * 0.18}
            />
          ))}
        </g>
      </svg>
    </div>
  );
}

type Orbit = {
  /** Base radius of the blob, as a fraction of canvas size. */
  radius: number;
  /** Distance from center, as a fraction of canvas size. */
  distance: number;
  /** Orbit angular speed (rad/sec). Coprime-ish so silhouette drifts. */
  speed: number;
  /** Orbit phase offset (rad). */
  phase: number;
  /** How strongly this blob responds to the heartbeat (0..1). */
  pulseAmp: number;
  /** Slow per-blob breathing frequency (rad/sec). */
  breathSpeed: number;
  /** Slow per-blob breathing phase. */
  breathPhase: number;
};

const ORBITS: Orbit[] = [
  { radius: 0.20, distance: 0.00, speed: 0.0,  phase: 0,        pulseAmp: 1.00, breathSpeed: 0.55, breathPhase: 0.0 },
  { radius: 0.14, distance: 0.18, speed: 0.42, phase: 0.0,      pulseAmp: 0.85, breathSpeed: 0.60, breathPhase: 1.2 },
  { radius: 0.13, distance: 0.20, speed: 0.31, phase: 1.2,      pulseAmp: 0.80, breathSpeed: 0.71, breathPhase: 2.4 },
  { radius: 0.12, distance: 0.22, speed: 0.55, phase: 2.4,      pulseAmp: 0.75, breathSpeed: 0.49, breathPhase: 3.6 },
  { radius: 0.11, distance: 0.16, speed: -0.38, phase: 3.6,     pulseAmp: 0.70, breathSpeed: 0.66, breathPhase: 4.8 },
  { radius: 0.10, distance: 0.24, speed: -0.27, phase: 4.8,     pulseAmp: 0.65, breathSpeed: 0.81, breathPhase: 6.0 },
];

function pickPalette(heat: number): { inner: string; outer: string } {
  // Cool indigo→teal at low heat; saturated pink→orange at high heat.
  if (heat < 0.25) {
    return { inner: "#a5b4ff", outer: "#5e5cff" };
  }
  if (heat < 0.5) {
    return { inner: "#a78bfa", outer: "#7c5cff" };
  }
  if (heat < 0.75) {
    return { inner: "#ff9bd8", outer: "#ff2d9c" };
  }
  return { inner: "#ffb98a", outer: "#ff2d9c" };
}
