"use client";

import { useEffect, useRef } from "react";
import type { TrendingToken } from "@/types/token";

const HISTORY_WINDOW_MS = 60 * 60 * 1000; // 1 hour visible
const MAX_SAMPLES = 90;
const COLORS = ["#FF2D9C", "#5E5CFF", "#14F195", "#FF8B2D", "#8A6BFF"];

type Sample = { ts: number; price: number };
type TokenHistory = {
  ca: string;
  symbol: string;
  samples: Sample[];
  color: string;
  current: number;
  change24h: number;
};

/**
 * Live token chart on a shared % axis.
 *
 *   Y = price as % change since the start of the visible window (1h).
 *   X = time (right edge = now).
 *
 * All lines share the same y axis, so winners climb, losers drop, and the
 * lines naturally separate — no more pile-up of overlapping labels at the
 * right edge.
 *
 * Initial render uses each token's `price_change_1h` to synthesize a
 * plausible 1h trajectory (smoothstep + light noise). Real samples replace
 * the synthesized portion as time passes.
 */
export function LiveChart({
  tokens,
  limit = 5,
}: {
  tokens: TrendingToken[];
  limit?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const histRef = useRef<Map<string, TokenHistory>>(new Map());

  // Update histories whenever the tokens prop changes.
  useEffect(() => {
    const top = tokens.slice(0, limit);
    const now = Date.now();
    const seen = new Set<string>();

    top.forEach((token, idx) => {
      if (token.price_usd == null) return;
      seen.add(token.ca);
      const symbol = (token.symbol ?? "").replace(/^\$/, "").toUpperCase();
      const change1h = token.price_change_1h ?? 0;
      const change24h = token.price_change_24h ?? 0;
      const existing = histRef.current.get(token.ca);

      if (!existing) {
        const samples = synthesize1hHistory(token.price_usd, change1h, 32);
        histRef.current.set(token.ca, {
          ca: token.ca,
          symbol,
          samples,
          color: COLORS[idx % COLORS.length],
          current: token.price_usd,
          change24h,
        });
      } else {
        const last = existing.samples[existing.samples.length - 1];
        if (!last || now - last.ts > 4_000) {
          existing.samples.push({ ts: now, price: token.price_usd });
          while (existing.samples.length > MAX_SAMPLES) {
            existing.samples.shift();
          }
        }
        existing.symbol = symbol;
        existing.current = token.price_usd;
        existing.change24h = change24h;
        existing.color = COLORS[idx % COLORS.length];
      }
    });

    for (const ca of Array.from(histRef.current.keys())) {
      if (!seen.has(ca)) histRef.current.delete(ca);
    }
  }, [tokens, limit]);

  // Continuous render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio, 2);
    let raf = 0;
    let visible = true;
    const onVis = () => {
      visible = document.visibilityState === "visible";
    };
    document.addEventListener("visibilitychange", onVis);

    const draw = () => {
      raf = requestAnimationFrame(draw);
      if (!visible) return;

      const rect = canvas.getBoundingClientRect();
      if (canvas.width !== rect.width * dpr || canvas.height !== rect.height * dpr) {
        canvas.width = Math.floor(rect.width * dpr);
        canvas.height = Math.floor(rect.height * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const w = rect.width;
      const h = rect.height;
      ctx.clearRect(0, 0, w, h);

      // Layout
      const padL = 44;
      const padR = 100;
      const padT = 14;
      const padB = 22;
      const drawW = w - padL - padR;
      const drawH = h - padT - padB;

      const now = Date.now();
      const windowStart = now - HISTORY_WINDOW_MS;

      // Compute each token's % change since its first visible sample, plus the
      // global min/max so we can pick a shared y-axis.
      type Trace = {
        hist: TokenHistory;
        startPrice: number;
        endPct: number;
        points: { x: number; y: number; pct: number }[];
      };
      const traces: Trace[] = [];
      let globalMin = -2; // ensure we always show 0 prominently
      let globalMax = 2;

      for (const hist of histRef.current.values()) {
        if (hist.samples.length < 2) continue;
        const visibleSamples = hist.samples.filter((s) => s.ts >= windowStart);
        if (visibleSamples.length < 2) continue;
        const startPrice = visibleSamples[0].price;
        if (!startPrice || !Number.isFinite(startPrice)) continue;

        const trace: Trace = {
          hist,
          startPrice,
          endPct: 0,
          points: [],
        };
        for (const s of visibleSamples) {
          const pct = ((s.price / startPrice) - 1) * 100;
          if (pct < globalMin) globalMin = pct;
          if (pct > globalMax) globalMax = pct;
          const tFrac = (s.ts - windowStart) / HISTORY_WINDOW_MS;
          trace.points.push({ x: padL + tFrac * drawW, y: 0, pct });
        }
        trace.endPct = trace.points[trace.points.length - 1].pct;
        traces.push(trace);
      }

      // Pad the y range a touch
      const range = Math.max(globalMax - globalMin, 4);
      const pad = range * 0.12;
      const yMin = globalMin - pad;
      const yMax = globalMax + pad;
      const yRange = yMax - yMin;

      const yForPct = (pct: number) =>
        padT + (1 - (pct - yMin) / yRange) * drawH;

      // ── Background grid ──
      ctx.strokeStyle = "rgba(10, 10, 30, 0.05)";
      ctx.lineWidth = 1;
      ctx.font = "9px ui-monospace, monospace";
      ctx.fillStyle = "rgba(10, 10, 30, 0.32)";
      ctx.textBaseline = "middle";
      ctx.textAlign = "right";

      // Sensible grid steps based on range
      const niceSteps = pickGridSteps(yMin, yMax);
      for (const stepVal of niceSteps) {
        const y = yForPct(stepVal);
        ctx.beginPath();
        ctx.moveTo(padL, y);
        ctx.lineTo(padL + drawW, y);
        ctx.stroke();
        const label = `${stepVal >= 0 ? "+" : ""}${stepVal.toFixed(stepVal < 1 && stepVal > -1 ? 1 : 0)}%`;
        ctx.fillText(label, padL - 6, y);
      }

      // Zero line — slightly stronger
      ctx.strokeStyle = "rgba(10, 10, 30, 0.18)";
      ctx.lineWidth = 1;
      const yZero = yForPct(0);
      ctx.beginPath();
      ctx.moveTo(padL, yZero);
      ctx.lineTo(padL + drawW, yZero);
      ctx.stroke();

      // Vertical time markers
      ctx.strokeStyle = "rgba(10, 10, 30, 0.04)";
      ctx.setLineDash([2, 4]);
      for (let i = 1; i < 4; i++) {
        const x = padL + (drawW / 4) * i;
        ctx.beginPath();
        ctx.moveTo(x, padT);
        ctx.lineTo(x, padT + drawH);
        ctx.stroke();
      }
      ctx.setLineDash([]);

      // Axis time labels
      ctx.fillStyle = "rgba(10, 10, 30, 0.32)";
      ctx.font = "9px ui-monospace, monospace";
      ctx.textBaseline = "alphabetic";
      ctx.textAlign = "left";
      ctx.fillText("1h ago", padL, h - 4);
      ctx.textAlign = "right";
      ctx.fillText("now", padL + drawW, h - 4);

      // ── Lines ──
      // Compute final y for each trace
      for (const trace of traces) {
        for (const p of trace.points) p.y = yForPct(p.pct);
      }

      // Draw lines
      for (const trace of traces) {
        const pts = trace.points;
        if (pts.length < 2) continue;

        ctx.strokeStyle = trace.hist.color;
        ctx.lineWidth = 1.6;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.shadowColor = trace.hist.color;
        ctx.shadowBlur = 3;
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length - 1; i++) {
          const cx = (pts[i].x + pts[i + 1].x) / 2;
          const cy = (pts[i].y + pts[i + 1].y) / 2;
          ctx.quadraticCurveTo(pts[i].x, pts[i].y, cx, cy);
        }
        ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
        ctx.stroke();
        ctx.shadowBlur = 0;
      }

      // Resolve label positions: place at line tip, then collide-resolve
      // vertically so labels don't overlap.
      type Label = { x: number; y: number; trace: Trace };
      const labels: Label[] = traces.map((t) => {
        const tip = t.points[t.points.length - 1];
        return { x: tip.x, y: tip.y, trace: t };
      });
      labels.sort((a, b) => a.y - b.y);
      const minSpacing = 14;
      for (let i = 1; i < labels.length; i++) {
        const prev = labels[i - 1];
        if (labels[i].y - prev.y < minSpacing) {
          labels[i].y = prev.y + minSpacing;
        }
      }

      // Draw labels
      ctx.font = "bold 11px ui-sans-serif, system-ui, sans-serif";
      ctx.textBaseline = "middle";
      ctx.textAlign = "left";
      for (const lab of labels) {
        // Tip dot at the actual line end
        const tip = lab.trace.points[lab.trace.points.length - 1];
        ctx.fillStyle = lab.trace.hist.color;
        ctx.beginPath();
        ctx.arc(tip.x, tip.y, 2.6, 0, Math.PI * 2);
        ctx.fill();

        // Connector from tip to label if they got displaced
        if (Math.abs(tip.y - lab.y) > 2) {
          ctx.strokeStyle = lab.trace.hist.color;
          ctx.globalAlpha = 0.4;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(tip.x + 3, tip.y);
          ctx.lineTo(tip.x + 8, lab.y);
          ctx.stroke();
          ctx.globalAlpha = 1;
        }

        // Symbol
        ctx.fillStyle = lab.trace.hist.color;
        ctx.fillText(lab.trace.hist.symbol, tip.x + 10, lab.y);

        // % since window start
        const pct = lab.trace.endPct;
        const symW = ctx.measureText(lab.trace.hist.symbol).width;
        ctx.fillStyle = pct >= 0 ? "#0a8f57" : "#c1374a";
        ctx.font = "bold 10px ui-monospace, monospace";
        ctx.fillText(
          `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`,
          tip.x + 10 + symW + 6,
          lab.y,
        );
        ctx.font = "bold 11px ui-sans-serif, system-ui, sans-serif";
      }
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  return (
    <div
      className="w-full rounded-2xl border border-border-subtle backdrop-blur-md overflow-hidden"
      style={{
        background:
          "linear-gradient(180deg, rgba(255, 255, 255, 0.78), rgba(255, 255, 255, 0.55))",
        boxShadow:
          "0 1px 0 rgba(255,255,255,0.7) inset, 0 8px 28px rgba(10, 10, 30, 0.05)",
      }}
    >
      <div className="flex items-center justify-between px-4 pt-3.5 pb-1.5">
        <div className="flex items-center gap-2">
          <span className="relative flex size-1.5">
            <span className="absolute inline-flex h-full w-full rounded-full bg-accent-pulse opacity-75 animate-ping" />
            <span className="relative inline-flex size-1.5 rounded-full bg-accent-pulse" />
          </span>
          <span className="text-[9.5px] uppercase tracking-[0.22em] text-text-secondary font-bold">
            Live · top movers · 1h
          </span>
        </div>
        <span className="text-[9.5px] uppercase tracking-[0.18em] text-text-muted">
          % since 1h ago
        </span>
      </div>
      <canvas
        ref={canvasRef}
        style={{ display: "block", width: "100%", height: 132 }}
      />
    </div>
  );
}

/**
 * Build a synthetic 1h-ago → current trajectory from `price_change_1h`. This
 * is the price evolution over the last hour we DON'T have real samples for —
 * gets gradually replaced by real samples as time passes.
 */
function synthesize1hHistory(
  currentPrice: number,
  change1h: number,
  count: number,
): Sample[] {
  // If we don't have a 1h figure, scale 24h to 1h linearly as a fallback.
  // Worst case: gives a flat-ish line, which is honest.
  const startPrice = currentPrice / (1 + change1h / 100);
  const now = Date.now();
  const out: Sample[] = [];
  for (let i = 0; i < count; i++) {
    const tFrac = i / (count - 1);
    const eased = tFrac * tFrac * (3 - 2 * tFrac);
    const trend = startPrice + (currentPrice - startPrice) * eased;
    // Light noise, scales with volatility — not too wiggly.
    const noiseAmp = Math.abs(currentPrice - startPrice) * 0.035 + currentPrice * 0.0008;
    const noise = (Math.random() - 0.5) * 2 * noiseAmp;
    out.push({
      ts: now - HISTORY_WINDOW_MS * (1 - tFrac),
      price: trend + noise,
    });
  }
  // Pin the last sample to the exact current price.
  out[out.length - 1] = { ts: now, price: currentPrice };
  return out;
}

/** Pick 3–4 nice grid step values for the y axis given min/max range. */
function pickGridSteps(yMin: number, yMax: number): number[] {
  const range = yMax - yMin;
  const candidates = [0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500];
  let step = candidates[0];
  for (const c of candidates) {
    if (range / c <= 6) {
      step = c;
      break;
    }
  }
  const out: number[] = [];
  const start = Math.ceil(yMin / step) * step;
  for (let v = start; v <= yMax; v += step) {
    if (Math.abs(v) > 0.0001) out.push(v); // skip 0, drawn separately
  }
  return out;
}
