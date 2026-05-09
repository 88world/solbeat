"use client";

import { useEffect, useRef } from "react";

type Props = {
  bpm: number;
  width?: number;
  height?: number;
  /** RGB hex color of the trace line. */
  color?: string;
};

/**
 * Canvas-animated ECG trace. The waveform scrolls right-to-left at a rate
 * derived from the BPM — peaks pass at exactly the BPM cadence, so when the
 * sphere is beating at 78 BPM the trace is too. Shape is the standard PQRST
 * complex (P wave → QRS spike → T wave) drawn with a glowing stroke.
 *
 * Pure 2D canvas, no React per-frame re-render. The component owns one
 * requestAnimationFrame loop that survives BPM changes (we just read the
 * latest BPM via a ref).
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

    // Hi-DPI sharpness
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

      const period = 60 / Math.max(20, bpmRef.current);
      const cyclesVisible = 3.5;
      const totalSeconds = cyclesVisible * period;
      const pxPerSec = w / totalSeconds;

      const samples = 240;
      const points: [number, number][] = [];
      for (let i = 0; i <= samples; i++) {
        const x = (i / samples) * w;
        const t = timeSec - (w - x) / pxPerSec;
        const phase = ((t / period) % 1 + 1) % 1;
        const y = h / 2 - ecgWave(phase) * h * 0.42;
        points.push([x, y]);
      }

      // Glow pass — fat blurred line underneath
      ctx.shadowColor = color;
      ctx.shadowBlur = 10;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(points[0][0], points[0][1]);
      for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i][0], points[i][1]);
      }
      ctx.stroke();

      // Crisp top pass
      ctx.shadowBlur = 0;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(points[0][0], points[0][1]);
      for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i][0], points[i][1]);
      }
      ctx.stroke();

      // Glowing dot at the right edge — the "stylus" tip
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

/** Standard PQRST complex, t in [0, 1]. */
function ecgWave(t: number): number {
  if (t < 0.06) return 0;
  if (t < 0.13) return 0.18 * Math.sin(((t - 0.06) / 0.07) * Math.PI); // P
  if (t < 0.18) return 0;
  if (t < 0.20) return -0.30 * ((t - 0.18) / 0.02); // Q dip
  if (t < 0.22) return -0.30 + 1.55 * ((t - 0.20) / 0.02); // R rise
  if (t < 0.24) return 1.25 - 1.55 * ((t - 0.22) / 0.02); // R fall
  if (t < 0.27) return -0.30 + 0.30 * ((t - 0.24) / 0.03); // S → 0
  if (t < 0.40) return 0;
  if (t < 0.52) return 0.32 * Math.sin(((t - 0.40) / 0.12) * Math.PI); // T
  return 0;
}
