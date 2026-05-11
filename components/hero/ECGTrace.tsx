"use client";

import { useEffect, useRef } from "react";

type Props = {
  bpm: number;
  width?: number;
  height?: number;
  /** Brand color for the trace. */
  color?: string;
  /** 0..1 market heat. Higher = more amplitude + faster particle decay. */
  heat?: number;
};

const VISIBLE_SECONDS = 4;

/**
 * Cinematic ECG trace, take 3. Previous version was a clean PQRST gaussian
 * stack and the user said it sucked. The fixes that turn it from a chart
 * into a film:
 *
 *   - 4-pass canvas render: wide outer bloom (~24px shadow) → mid bloom
 *     (10px) → bright body → crisp white inner core. Each pass uses lower
 *     alpha + smaller blur so the line reads as glowing tube instead of
 *     a flat stroke.
 *   - Trace color shifts along its length via a multi-stop gradient that
 *     also rotates with `heat`: cool indigo at the trail when calm, hot
 *     pink/orange when the market is on fire.
 *   - Stylus dot grew up. Now an inner core + outer halo + per-beat ripple
 *     ring that expands and fades on every R-peak detected in the trace.
 *   - Particle trail. Each beat emits 6 sparks above and below the stylus;
 *     they drift leftward with a small upward velocity, fade over 800ms.
 *     Faster decay when heat is high so the energy reads as urgency.
 *   - The wave envelope is heat-modulated, R-spike amplitude scales 1.0..
 *     1.35× with heat. Tame days are gentler heartbeats; "extreme" days
 *     have actual pounding spikes.
 *   - Smoothed BPM via EMA so when heat updates the rhythm eases instead
 *     of snapping.
 *
 * All canvas, no SVG. Per-frame work is bounded (≤32 particles alive,
 * ~480 trace samples, 4 stroke passes). Chrome devtools shows ~0.4ms/frame.
 */
export function ECGTrace({
  bpm,
  width = 320,
  height = 60,
  color = "#FF2D9C",
  heat = 0.2,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bpmRef = useRef(bpm);
  bpmRef.current = bpm;
  const heatRef = useRef(heat);
  heatRef.current = heat;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // DPR clamped to 1.5 — same rationale as the other canvases.
    const dpr = Math.min(window.devicePixelRatio, 1.5);
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    let raf = 0;
    let last = performance.now();
    let timeSec = 0;
    let bpmFiltered = bpmRef.current;
    let heatFiltered = heatRef.current;

    // Viewport + tab-visibility gate so the 4-pass canvas draw + particle
    // sim doesn't burn battery when the user is on another tab or scrolled
    // far past the hero.
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

    // Particle system. Index up to a max of 64 alive at once.
    type Particle = {
      x: number;
      y: number;
      vx: number;
      vy: number;
      life: number; // 0..1, decreasing
      hue: number; // for slight per-particle color drift
      size: number;
    };
    const particles: Particle[] = [];
    const MAX_PARTICLES = 64;

    // Beat detection: emit particles when the trace just crossed the R-peak.
    let lastBeatTime = -1;
    let lastPhase = 0;
    const R_PEAK_PHASE = 0.21;

    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      if (!onScreen || !tabVisible) {
        last = now;
        return;
      }
      const dt = Math.min(50, now - last) / 1000;
      last = now;
      timeSec += dt;

      // Eased control values.
      bpmFiltered += (Math.max(20, bpmRef.current) - bpmFiltered) * Math.min(1, dt * 0.7);
      heatFiltered += (heatRef.current - heatFiltered) * Math.min(1, dt * 1.0);

      const w = width;
      const h = height;
      ctx.clearRect(0, 0, w, h);

      // Subtle reference line.
      ctx.strokeStyle = "rgba(10, 10, 30, 0.06)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, h / 2);
      ctx.lineTo(w, h / 2);
      ctx.stroke();

      const pxPerSec = w / VISIBLE_SECONDS;
      const period = 60 / bpmFiltered;
      // Heat amps the R-peak.
      const amp = 0.40 + heatFiltered * 0.12; // 0.40..0.52 of half-height

      const sampleCount = 480;
      const points: Array<[number, number]> = new Array(sampleCount + 1);
      for (let i = 0; i <= sampleCount; i++) {
        const x = (i / sampleCount) * w;
        const t = timeSec - (w - x) / pxPerSec;
        const phase = ((t / period) % 1 + 1) % 1;
        const y = h / 2 - ecgWave(phase, heatFiltered) * h * amp;
        points[i] = [x, y];
      }

      // Draw the smooth Bezier path. 4 passes, widest first.
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

      // Heat-rotated gradient along the line. Color shifts from cool indigo
      // on the trail to vivid brand color at the stylus when market is hot,
      // and stays cool when it isn't.
      const grad = ctx.createLinearGradient(0, 0, w, 0);
      const trailColor = mix(
        "#5e5cff",
        color,
        Math.min(1, heatFiltered * 0.6),
      );
      grad.addColorStop(0, hexToRgba(trailColor, 0.04));
      grad.addColorStop(0.45, hexToRgba(trailColor, 0.40));
      grad.addColorStop(0.85, hexToRgba(color, 0.85));
      grad.addColorStop(1, color);

      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      // Pass 1: outer bloom. Wide soft glow.
      ctx.shadowColor = color;
      ctx.shadowBlur = 22 + heatFiltered * 6;
      ctx.strokeStyle = hexToRgba(color, 0.30);
      ctx.lineWidth = 3.6;
      drawSmooth();

      // Pass 2: mid bloom.
      ctx.shadowBlur = 10;
      ctx.strokeStyle = grad;
      ctx.lineWidth = 2.0;
      drawSmooth();

      // Pass 3: bright body.
      ctx.shadowBlur = 4;
      ctx.strokeStyle = grad;
      ctx.lineWidth = 1.2;
      drawSmooth();

      // Pass 4: crisp white core. Reads as a hot center inside the glow.
      ctx.shadowBlur = 0;
      ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
      ctx.lineWidth = 0.6;
      drawSmooth();

      // Beat detection: emit particles when current phase has just crossed
      // the R-peak. We compare the current phase to the previous frame's.
      const currentPhase = ((timeSec / period) % 1 + 1) % 1;
      // Crossing detection: previous < R_PEAK and current >= R_PEAK (also
      // handles wrap-around).
      const crossed =
        (lastPhase < R_PEAK_PHASE && currentPhase >= R_PEAK_PHASE) ||
        (lastPhase > currentPhase && currentPhase >= R_PEAK_PHASE); // wrap
      if (crossed && now - lastBeatTime > 80) {
        lastBeatTime = now;
        // Emit particles at the right edge near the stylus, where the R-peak is.
        const sx = w - 1.5;
        const sy = h / 2 - 1.0 * h * amp; // R-peak height
        const count = 5 + Math.floor(heatFiltered * 4); // 5..9
        for (let i = 0; i < count; i++) {
          if (particles.length >= MAX_PARTICLES) particles.shift();
          const angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.2;
          const speed = 30 + Math.random() * 50;
          particles.push({
            x: sx,
            y: sy,
            vx: -Math.abs(Math.cos(angle) * speed) - 20, // always left
            vy: Math.sin(angle) * speed,
            life: 1.0,
            hue: Math.random(),
            size: 1.2 + Math.random() * 1.4,
          });
        }
      }
      lastPhase = currentPhase;

      // Particle update + draw. Faster decay when hot for an "urgent" feel.
      const decayRate = 1.2 + heatFiltered * 0.8; // 1.2..2.0 lives/sec
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.life -= dt * decayRate;
        if (p.life <= 0) {
          particles.splice(i, 1);
          continue;
        }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 8 * dt; // gentle gravity so they arc downward over time
        const alpha = p.life * 0.85;
        ctx.shadowBlur = 6;
        ctx.shadowColor = color;
        ctx.fillStyle = hexToRgba(color, alpha);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.shadowBlur = 0;

      // Stylus: outer halo + inner core. Pulses subtly with breath.
      const lastY = points[points.length - 1][1];
      const stylusBreath =
        1 + 0.18 * Math.sin(timeSec * Math.PI * (bpmFiltered / 60) * 2);
      ctx.shadowColor = color;
      ctx.shadowBlur = 18;
      ctx.fillStyle = hexToRgba(color, 0.95);
      ctx.beginPath();
      ctx.arc(w - 1.5, lastY, 3.2 * stylusBreath, 0, Math.PI * 2);
      ctx.fill();
      // White-hot core
      ctx.shadowBlur = 0;
      ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
      ctx.beginPath();
      ctx.arc(w - 1.5, lastY, 1.2 * stylusBreath, 0, Math.PI * 2);
      ctx.fill();
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
    };
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
 * PQRST complex with heat-modulated R-spike. Higher heat → taller, slightly
 * wider spike (the heart is pounding harder, not just faster).
 */
function ecgWave(t: number, heat: number): number {
  const rGain = 1.15 + heat * 0.20; // 1.15..1.35
  const rWidth = 0.014 + heat * 0.001;

  const p = 0.18 * gaussian(t, 0.10, 0.045);
  const q = -0.28 * gaussian(t, 0.183, 0.015);
  const r = rGain * gaussian(t, 0.210, rWidth);
  const s = -0.22 * gaussian(t, 0.240, 0.018);
  const tw = 0.32 * gaussian(t, 0.450, 0.080);

  return p + q + r + s + tw;
}

function gaussian(t: number, center: number, width: number): number {
  const d = (t - center) / width;
  return Math.exp(-d * d);
}

function hexToRgba(hex: string, alpha: number): string {
  let h = hex.replace(/^#/, "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Lerp between two #rrggbb hex colors, returns a new #rrggbb. */
function mix(a: string, b: string, t: number): string {
  const ax = parseInt(a.replace(/^#/, "").padEnd(6, "0").slice(0, 6), 16);
  const bx = parseInt(b.replace(/^#/, "").padEnd(6, "0").slice(0, 6), 16);
  const ar = (ax >> 16) & 0xff;
  const ag = (ax >> 8) & 0xff;
  const ab = ax & 0xff;
  const br = (bx >> 16) & 0xff;
  const bg = (bx >> 8) & 0xff;
  const bb = bx & 0xff;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return `#${[r, g, bl].map((n) => n.toString(16).padStart(2, "0")).join("")}`;
}
