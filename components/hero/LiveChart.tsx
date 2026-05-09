"use client";

import { useEffect, useRef } from "react";
import type { TrendingToken } from "@/types/token";

const HISTORY_WINDOW_MS = 60 * 60 * 1000; // 1 hour visible
const MAX_SAMPLES = 80;
const COLORS = ["#FF2D9C", "#5E5CFF", "#14F195", "#FF8B2D", "#8A6BFF"];

type Sample = { ts: number; price: number };
type TokenHistory = {
  ca: string;
  symbol: string;
  samples: Sample[];
  color: string;
  change24h: number;
  current: number;
};

/**
 * Live token chart. Plots the top N trending tokens as overlapping
 * normalized lines on a scrolling time axis (last hour visible). Each line
 * gets its own color and a label at the right edge with the live price + 24h
 * percent change.
 *
 * Initial render synthesizes a plausible 24h trajectory from the token's
 * 24h % change so the chart is populated immediately. Real samples are
 * appended on every tokens-prop update (parent polls /api/trending) and
 * gradually replace the synthesized portion as time passes.
 *
 * Per-token y-normalization: each line scales to its own visible-window min/max
 * so movements are visually comparable regardless of absolute price.
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
      const change24 = token.price_change_24h ?? 0;
      const existing = histRef.current.get(token.ca);

      if (!existing) {
        // First sighting — seed history from synthesized 24h trajectory.
        const samples = synthesizeHistory(token.price_usd, change24, 36);
        histRef.current.set(token.ca, {
          ca: token.ca,
          symbol,
          samples,
          color: COLORS[idx % COLORS.length],
          change24h: change24,
          current: token.price_usd,
        });
      } else {
        // Append the fresh sample (deduped by ≥4s spacing).
        const last = existing.samples[existing.samples.length - 1];
        if (!last || now - last.ts > 4_000) {
          existing.samples.push({ ts: now, price: token.price_usd });
          while (existing.samples.length > MAX_SAMPLES) {
            existing.samples.shift();
          }
        }
        existing.symbol = symbol;
        existing.change24h = change24;
        existing.current = token.price_usd;
        existing.color = COLORS[idx % COLORS.length];
      }
    });

    // Drop any token that fell out of the top.
    for (const ca of Array.from(histRef.current.keys())) {
      if (!seen.has(ca)) histRef.current.delete(ca);
    }
  }, [tokens, limit]);

  // Continuous render loop (60fps). Drives the smooth scroll feel — each
  // frame the right edge advances by `dt`, so lines literally move.
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

      // Background grid
      ctx.strokeStyle = "rgba(10, 10, 30, 0.05)";
      ctx.lineWidth = 1;
      const gridLines = 4;
      for (let i = 1; i < gridLines; i++) {
        const y = (h / gridLines) * i;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }
      // Vertical time markers (every 15min, 4 over 1h window)
      ctx.strokeStyle = "rgba(10, 10, 30, 0.04)";
      const padR = 96; // right pad for labels
      const padL = 12;
      const drawW = w - padR - padL;
      for (let i = 1; i < 4; i++) {
        const x = padL + (drawW / 4) * i;
        ctx.beginPath();
        ctx.setLineDash([2, 4]);
        ctx.moveTo(x, 8);
        ctx.lineTo(x, h - 8);
        ctx.stroke();
      }
      ctx.setLineDash([]);

      // Axis labels (very subtle)
      ctx.fillStyle = "rgba(10, 10, 30, 0.32)";
      ctx.font = "9px ui-monospace, monospace";
      ctx.textBaseline = "bottom";
      ctx.textAlign = "left";
      ctx.fillText("1h ago", padL, h - 2);
      ctx.textAlign = "right";
      ctx.fillText("now", padL + drawW, h - 2);

      const now = Date.now();
      const windowStart = now - HISTORY_WINDOW_MS;

      // Sort by current % change descending so labels stack nicely (top mover at top).
      const ordered = Array.from(histRef.current.values()).sort(
        (a, b) => b.change24h - a.change24h,
      );

      ordered.forEach((hist) => {
        if (hist.samples.length < 2) return;

        // Filter visible samples
        const visibleSamples = hist.samples.filter((s) => s.ts >= windowStart);
        if (visibleSamples.length < 2) return;

        // Per-token normalization
        let minP = Infinity;
        let maxP = -Infinity;
        for (const s of visibleSamples) {
          if (s.price < minP) minP = s.price;
          if (s.price > maxP) maxP = s.price;
        }
        const rangeP = Math.max(maxP - minP, Math.abs(minP) * 0.0008);

        // Map samples to canvas coords. Y leaves a little padding top/bottom.
        const yTop = 14;
        const yBot = h - 18;
        const yRange = yBot - yTop;

        const pts: { x: number; y: number }[] = visibleSamples.map((s) => {
          const tFrac = (s.ts - windowStart) / HISTORY_WINDOW_MS;
          const x = padL + tFrac * drawW;
          const norm = (s.price - minP) / rangeP;
          // Higher price → higher on chart (y inverted)
          const y = yBot - norm * yRange;
          return { x, y };
        });

        // Smooth-ish line via quadratic interpolation
        ctx.strokeStyle = hist.color;
        ctx.lineWidth = 1.7;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.shadowColor = hist.color;
        ctx.shadowBlur = 4;
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

        // End-of-line dot
        const tip = pts[pts.length - 1];
        ctx.fillStyle = hist.color;
        ctx.beginPath();
        ctx.arc(tip.x, tip.y, 2.6, 0, Math.PI * 2);
        ctx.fill();

        // Label at right edge
        const labelX = tip.x + 8;
        const labelY = tip.y;
        ctx.fillStyle = hist.color;
        ctx.font = "bold 11px ui-sans-serif, system-ui, sans-serif";
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText(hist.symbol, labelX, labelY);

        // % change
        const pct = hist.change24h;
        ctx.fillStyle = pct >= 0 ? "#0a8f57" : "#c1374a";
        ctx.font = "bold 10px ui-monospace, monospace";
        const symMetrics = ctx.measureText(hist.symbol);
        ctx.fillText(
          `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`,
          labelX + symMetrics.width + 6,
          labelY,
        );
      });
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
      <div className="flex items-center justify-between px-4 pt-3.5 pb-1">
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
          5 tokens
        </span>
      </div>
      <canvas ref={canvasRef} style={{ display: "block", width: "100%", height: 132 }} />
    </div>
  );
}

/**
 * Build a synthetic 24h-ago → current trajectory from a price + percent change.
 * The shape is a smoothstep with subtle noise so it doesn't look like a
 * straight line. Real samples will gradually replace this as time passes.
 */
function synthesizeHistory(
  currentPrice: number,
  change24h: number,
  count: number,
): Sample[] {
  const startPrice = currentPrice / (1 + change24h / 100);
  const now = Date.now();
  const out: Sample[] = [];
  for (let i = 0; i < count; i++) {
    const tFrac = i / (count - 1);
    const eased = tFrac * tFrac * (3 - 2 * tFrac);
    const trend = startPrice + (currentPrice - startPrice) * eased;
    const noise = (Math.random() - 0.5) * 0.006 * Math.abs(currentPrice);
    out.push({
      ts: now - HISTORY_WINDOW_MS * (1 - tFrac),
      price: trend + noise,
    });
  }
  // Pin the last sample exactly at current price so the live tip is honest.
  out[out.length - 1] = { ts: now, price: currentPrice };
  return out;
}
