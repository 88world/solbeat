"use client";

import { useEffect, useRef } from "react";
import * as d3 from "d3";

type Props = {
  /** Heat 0..1 — drives global amplitude + frequency. */
  heat: number;
  /** SOL macro 0..1 — slow long-period carrier wave (the underlying current). */
  sol: number;
  /** Breadth 0..1 — secondary mid-period wave (the chorus). */
  breadth: number;
  /** Volume 0..1 — third short-period wave (the chatter). */
  volume: number;
  /** Extreme 0..1 — sparse spikes (rare, sharp). */
  extreme: number;
  width?: number;
  height?: number;
};

/**
 * Living heat waveform. Replaces the four CSS-width-animated progress bars
 * (which Gemini correctly called "loading-bar behavior, not a heartbeat")
 * with a Canvas2D continuous wave whose shape is *driven by the actual
 * heat components*:
 *
 *   y(x, t) = Σ component_i × sin(x · k_i + t · ω_i)  + spike(extreme, t)
 *
 * Each heat component contributes a sine wave at its own period and
 * amplitude. SOL macro is the slow carrier (long wavelength, big amplitude
 * when SOL is moving). Breadth is the mid-period wave. Volume is the high-
 * frequency chatter. Extreme adds sparse sharp spikes when there's
 * parabolic energy on the trending list.
 *
 * The result: one continuous, living waveform that READS the market state
 * in real time. When breadth goes from 0.3 to 0.8, the chorus wave grows
 * smoothly without snapping, because every render reads the latest values
 * eased via EMA. No React state in the per-frame path.
 *
 * Three rendering passes for the cinematic feel: outer glow (wide blur),
 * mid line (gradient stroke), crisp white core. Same recipe as the ECG.
 */
export function HeartWave({
  heat,
  sol,
  breadth,
  volume,
  extreme,
  width = 480,
  height = 96,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // refs so the rAF loop reads latest values without re-running the effect.
  const heatRef = useRef(heat);
  const solRef = useRef(sol);
  const breadthRef = useRef(breadth);
  const volumeRef = useRef(volume);
  const extremeRef = useRef(extreme);

  heatRef.current = heat;
  solRef.current = sol;
  breadthRef.current = breadth;
  volumeRef.current = volume;
  extremeRef.current = extreme;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio, 2);
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    let raf = 0;
    let last = performance.now();
    let t = 0;
    // Viewport + tab-visibility gating. Pause rAF when off-screen or hidden
    // to drop the canvas redraw cost when the user isn't looking.
    let onScreen = true;
    let tabVisible = !document.hidden;
    const io = new IntersectionObserver(
      (entries) => {
        onScreen = entries[0]?.isIntersecting ?? true;
      },
      { threshold: 0.01 },
    );
    io.observe(canvas);
    const onVis = () => {
      tabVisible = !document.hidden;
    };
    document.addEventListener("visibilitychange", onVis);

    // EMA-smoothed components so changes ease in.
    let sH = heatRef.current;
    let sSol = solRef.current;
    let sBreadth = breadthRef.current;
    let sVol = volumeRef.current;
    let sExt = extremeRef.current;

    // d3 scale, x → screen pixels.
    const xScale = d3.scaleLinear().domain([0, 1]).range([0, width]);

    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      // Don't burn frames if the user can't see the canvas.
      if (!onScreen || !tabVisible) {
        last = now;
        return;
      }
      const dt = Math.min(50, now - last) / 1000;
      last = now;
      t += dt;

      // Smooth toward target each frame — avoids snap when poll lands.
      const k = Math.min(1, dt * 1.6);
      sH += (heatRef.current - sH) * k;
      sSol += (solRef.current - sSol) * k;
      sBreadth += (breadthRef.current - sBreadth) * k;
      sVol += (volumeRef.current - sVol) * k;
      sExt += (extremeRef.current - sExt) * k;

      ctx.clearRect(0, 0, width, height);

      // Subtle horizontal grid (medical-monitor reference).
      ctx.strokeStyle = "rgba(10, 10, 30, 0.04)";
      ctx.lineWidth = 1;
      const midY = height / 2;
      for (let i = -2; i <= 2; i++) {
        const yy = midY + i * (height * 0.18);
        ctx.beginPath();
        ctx.moveTo(0, yy);
        ctx.lineTo(width, yy);
        ctx.stroke();
      }

      // Build the wave path as a sample array, then stroke it 3 times.
      // Higher heat → wave reaches further from baseline.
      const SAMPLES = 280;
      const points: Array<[number, number]> = new Array(SAMPLES + 1);
      const baseAmp = height * 0.34;

      // Per-component contributions.
      // Each component contributes amplitude × sin(ωx + φt). Periods picked
      // so they don't beat in resonance, the silhouette evolves continuously.
      const solAmp = sSol * baseAmp * 0.85; // slow, big
      const breadthAmp = sBreadth * baseAmp * 0.55; // mid
      const volAmp = sVol * baseAmp * 0.30; // fast, small
      const heatBoost = 0.6 + sH * 0.6; // 0.6..1.2x global multiplier
      const speed = 0.5 + sH * 1.6; // 0.5..2.1 phase rate (rad/s)

      for (let i = 0; i <= SAMPLES; i++) {
        const u = i / SAMPLES;
        const x = xScale(u);

        // Wavelengths in radians: long, mid, short.
        const solWave = Math.sin(u * 4.0 * Math.PI - t * 0.7 * speed) * solAmp;
        const breadthWave = Math.sin(u * 9.5 * Math.PI - t * 1.6 * speed) * breadthAmp;
        const volWave = Math.sin(u * 22 * Math.PI - t * 3.2 * speed) * volAmp;

        // Extreme spikes: a tight gaussian bump that slides leftward, only
        // visible at moderate-to-high extreme. Rare and sharp.
        const spikePhase = ((t * 0.4 * speed) % 1 + 1) % 1;
        const spikeCenter = 1 - spikePhase; // moves right→left across the canvas
        const spikeWidth = 0.04;
        const dist = (u - spikeCenter) / spikeWidth;
        const spike = sExt * baseAmp * 1.2 * Math.exp(-dist * dist) * (sExt > 0.05 ? 1 : 0);

        const y = midY - (solWave + breadthWave + volWave + spike) * heatBoost;
        points[i] = [x, y];
      }

      // Compose color from components: green (volume / breadth, healthy),
      // pink (extreme / volatility, parabolic), indigo (calm).
      const heatTint = sH;
      const stroke = pickWaveColor(heatTint);

      const grad = ctx.createLinearGradient(0, 0, width, 0);
      grad.addColorStop(0, `${stroke}11`);
      grad.addColorStop(0.45, `${stroke}66`);
      grad.addColorStop(1, stroke);

      const drawSmooth = () => {
        ctx.beginPath();
        ctx.moveTo(points[0][0], points[0][1]);
        for (let i = 1; i < points.length - 1; i++) {
          const xc = (points[i][0] + points[i + 1][0]) * 0.5;
          const yc = (points[i][1] + points[i + 1][1]) * 0.5;
          ctx.quadraticCurveTo(points[i][0], points[i][1], xc, yc);
        }
        ctx.lineTo(points[points.length - 1][0], points[points.length - 1][1]);
        ctx.stroke();
      };

      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      // Pass 1: glow.
      ctx.shadowColor = stroke;
      ctx.shadowBlur = 18 + sH * 10;
      ctx.strokeStyle = `${stroke}33`;
      ctx.lineWidth = 4;
      drawSmooth();

      // Pass 2: gradient body.
      ctx.shadowBlur = 8;
      ctx.strokeStyle = grad;
      ctx.lineWidth = 1.8;
      drawSmooth();

      // Pass 3: white-hot core.
      ctx.shadowBlur = 0;
      ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
      ctx.lineWidth = 0.6;
      drawSmooth();
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [width, height]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width, height, display: "block" }}
      aria-hidden
    />
  );
}

/** Color of the wave shifts with heat: indigo calm → pink elevated → red extreme. */
function pickWaveColor(heat: number): string {
  if (heat > 0.85) return "#c1374a"; // crimson, cardiac
  if (heat > 0.65) return "#FF2D9C"; // BV pink, on-fire
  if (heat > 0.40) return "#a78bfa"; // violet, active
  return "#5e5cff"; // indigo, calm
}
