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
 *     BPM — the *waveform spikes* get closer together when the heart races,
 *     but the paper itself moves at the same rate. This is how real cardiac
 *     monitors render and feels natural.
 *   - Waveform built from Gaussian peaks (P, Q, R, S, T) instead of linear
 *     ramps. The R spike is still iconic and tall, but the curve has no
 *     angular corners — every transition is C¹ continuous.
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

    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      const dt = Math.min(50, now - last) / 1000;
      last = now;
      timeSec += dt;

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

      // Fixed scroll cadence — visible window is always 4s
      const pxPerSec = w / VISIBLE_SECONDS;
      const period = 60 / Math.max(20, bpmRef.current);

      const sampleCount = 360;
      const points: Array<[number, number]> = new Array(sampleCount + 1);
      for (let i = 0; i <= sampleCount; i++) {
        const x = (i / sampleCount) * w;
        const t = timeSec - (w - x) / pxPerSec;
        const phase = ((t / period) % 1 + 1) % 1;
        const y = h / 2 - ecgWave(phase) * h * 0.40;
        points[i] = [x, y];
      }

      // Smooth Bezier draw — use midpoints as anchors with each sample as a
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

      // Glow pass (fat blurred line under the crisp one)
      ctx.shadowColor = color;
      ctx.shadowBlur = 10;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      drawSmooth();

      // Crisp top pass
      ctx.shadowBlur = 0;
      ctx.lineWidth = 1.4;
      drawSmooth();

      // Glowing stylus dot at the right edge — tracks the live waveform
      const lastY = points[points.length - 1][1];
      ctx.shadowColor = color;
      ctx.shadowBlur = 12;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(w - 1.5, lastY, 2.5, 0, Math.PI * 2);
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
 * ramps — every transition is curved, no angular kinks. The R spike is still
 * tall and narrow (iconic ECG look) but the stroke is C¹ continuous.
 */
function ecgWave(t: number): number {
  // P wave — smooth atrial depolarization bump
  const p = 0.18 * gaussian(t, 0.10, 0.040);

  // Q dip — narrow negative
  const q = -0.30 * gaussian(t, 0.183, 0.013);

  // R spike — tall narrow positive (the iconic peak)
  const r = 1.30 * gaussian(t, 0.210, 0.012);

  // S dip — short negative after R
  const s = -0.25 * gaussian(t, 0.240, 0.015);

  // T wave — broader repolarization bump
  const tw = 0.32 * gaussian(t, 0.450, 0.075);

  return p + q + r + s + tw;
}

function gaussian(t: number, center: number, width: number): number {
  const d = (t - center) / width;
  return Math.exp(-d * d);
}
