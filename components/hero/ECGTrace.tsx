"use client";

import { useEffect, useRef } from "react";

type Props = {
  bpm: number;
  width?: number;
  height?: number;
  /** RGB hex color of the trace line. */
  color?: string;
};

const VISIBLE_SECONDS = 4; // constant scroll-speed window (real ECG monitors do this)

/**
 * Canvas-animated ECG trace with smooth motion.
 *
 *   - Fixed-time window (4s visible). Scroll speed is constant regardless of
 *     BPM, the *waveform spikes* get closer together when the heart races,
 *     but the paper itself moves at the same rate. This is how real cardiac
 *     monitors render and feels natural.
 *   - Waveform built from Gaussian peaks (P, Q, R, S, T) instead of linear
 *     ramps. The R spike is still iconic and tall, but the curve has no
 *     angular corners, every transition is C¹ continuous.
 *   - Canvas line drawn with quadratic Bezier interpolation between samples,
 *     so the rendered stroke is C¹ smooth too.
 */
export function ECGTrace({
  bpm,
  width = 320,
  height = 60,
  color = "#FF2D9C",
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bpmRef = useRef(bpm);
  bpmRef.current = bpm;

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
    let timeSec = 0;
    // EMA on BPM, target jumps in heat would otherwise snap the rhythm.
    // Convergence ~1.5s feels natural, like a heart easing into a new pace.
    let bpmFiltered = bpmRef.current;

    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      const dt = Math.min(50, now - last) / 1000;
      last = now;
      timeSec += dt;

      // Smoothly chase the target BPM.
      const target = Math.max(20, bpmRef.current);
      bpmFiltered += (target - bpmFiltered) * Math.min(1, dt * 0.7);

      const w = width;
      const h = height;
      ctx.clearRect(0, 0, w, h);

      // Faint center reference line
      ctx.strokeStyle = "rgba(10, 10, 30, 0.08)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, h / 2);
      ctx.lineTo(w, h / 2);
      ctx.stroke();

      // Fixed scroll cadence, visible window is always 4s
      const pxPerSec = w / VISIBLE_SECONDS;
      const period = 60 / bpmFiltered;

      const sampleCount = 480;
      const points: Array<[number, number]> = new Array(sampleCount + 1);
      for (let i = 0; i <= sampleCount; i++) {
        const x = (i / sampleCount) * w;
        const t = timeSec - (w - x) / pxPerSec;
        const phase = ((t / period) % 1 + 1) % 1;
        const y = h / 2 - ecgWave(phase) * h * 0.40;
        points[i] = [x, y];
      }

      // Smooth Bezier draw, use midpoints as anchors with each sample as a
      // control point. C¹ continuous, no angular kinks.
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

      // Cinematic left-to-right alpha gradient on the trace, the right edge
      // (the "now" stylus) reads brightest, the trail fades into the page.
      // Three rendering passes for an analog-monitor feel.
      const grad = ctx.createLinearGradient(0, 0, w, 0);
      grad.addColorStop(0, hexToRgba(color, 0.05));
      grad.addColorStop(0.55, hexToRgba(color, 0.55));
      grad.addColorStop(1, color);

      // Pass 1: wide soft glow
      ctx.shadowColor = color;
      ctx.shadowBlur = 14;
      ctx.strokeStyle = grad;
      ctx.lineWidth = 2.6;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      drawSmooth();

      // Pass 2: bright mid line
      ctx.shadowBlur = 6;
      ctx.lineWidth = 1.6;
      drawSmooth();

      // Pass 3: crisp center
      ctx.shadowBlur = 0;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.0;
      drawSmooth();

      // Glowing stylus dot at the right edge, tracks the live waveform.
      // Pulses subtly with the breath so it feels alive.
      const lastY = points[points.length - 1][1];
      const dotPulse = 1 + 0.18 * Math.sin(timeSec * Math.PI * (bpmFiltered / 60) * 2);
      ctx.shadowColor = color;
      ctx.shadowBlur = 16;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(w - 1.5, lastY, 2.6 * dotPulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    };
    raf = requestAnimationFrame(draw);

    return () => cancelAnimationFrame(raf);
  }, [width, height, color]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width, height, display: "block" }}
      aria-hidden
    />
  );
}

/**
 * PQRST complex built from 5 Gaussian peaks. Smoother than piecewise-linear
 * ramps, every transition is curved, no angular kinks. The R spike is still
 * tall and narrow (iconic ECG look) but the stroke is C¹ continuous.
 */
function ecgWave(t: number): number {
  // P wave, smooth atrial depolarization bump (slightly wider for fluidity)
  const p = 0.18 * gaussian(t, 0.10, 0.045);

  // Q dip, narrow negative (relaxed width so the dip isn't a hairline notch)
  const q = -0.28 * gaussian(t, 0.183, 0.015);

  // R spike, tall narrow positive. Softened from 1.30 to 1.15 and widened
  // 0.012 → 0.014 so the iconic spike still reads but doesn't look like a
  // razor blade, more "heartbeat", less "alarm bell".
  const r = 1.15 * gaussian(t, 0.210, 0.014);

  // S dip, short negative after R
  const s = -0.22 * gaussian(t, 0.240, 0.018);

  // T wave, broader repolarization bump
  const tw = 0.32 * gaussian(t, 0.450, 0.080);

  return p + q + r + s + tw;
}

function gaussian(t: number, center: number, width: number): number {
  const d = (t - center) / width;
  return Math.exp(-d * d);
}

/** "#FF2D9C" → "rgba(255, 45, 156, alpha)". Tolerant of 3- or 6-digit hex. */
function hexToRgba(hex: string, alpha: number): string {
  let h = hex.replace(/^#/, "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
