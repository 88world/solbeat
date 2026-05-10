"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { TrendingToken } from "@/types/token";

const MAX_SAMPLES = 180;

/**
 * Supported timeframes. Each maps to:
 *   - the window length the chart spans (windowMs)
 *   - which DexScreener %-change field we use to seed the synthesized
 *     pre-render history (`price_change_*`)
 *   - synthSamples: how many synthesized points fill that window before
 *     real samples start arriving. Longer windows get more points so the
 *     curve stays smooth instead of stepping between sparse anchors.
 */
type Timeframe = "5m" | "1h" | "6h" | "24h";
const TF_MAP: Record<
  Timeframe,
  {
    windowMs: number;
    changeField: keyof Pick<TrendingToken,
      "price_change_5m" | "price_change_1h" | "price_change_6h" | "price_change_24h">;
    label: string;
    synthSamples: number;
  }
> = {
  "5m":  { windowMs: 5 * 60 * 1000,        changeField: "price_change_5m",  label: "5m",  synthSamples: 36 },
  "1h":  { windowMs: 60 * 60 * 1000,       changeField: "price_change_1h",  label: "1h",  synthSamples: 60 },
  "6h":  { windowMs: 6 * 60 * 60 * 1000,   changeField: "price_change_6h",  label: "6h",  synthSamples: 96 },
  "24h": { windowMs: 24 * 60 * 60 * 1000,  changeField: "price_change_24h", label: "24h", synthSamples: 120 },
};
const COLORS = ["#FF2D9C", "#5E5CFF", "#14F195", "#FF8B2D", "#8A6BFF"];

/**
 * Stable per-token color. Hashing the contract address means BONK is always
 * pink, WIF is always blue, etc., even as the trending order shuffles. Index-
 * mod-COLORS.length flipped colors every time the rank changed; visually this
 * looked like the lines all swapped places, the opposite of "live".
 */
function colorForCa(ca: string): string {
  let h = 0;
  for (let i = 0; i < ca.length; i++) {
    h = (h * 31 + ca.charCodeAt(i)) >>> 0;
  }
  return COLORS[h % COLORS.length];
}

/** Hex-to-rgba helper for gradient fills under each trace. */
function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

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
 *   Y = price as % change since the start of the visible window.
 *   X = time (right edge = now).
 *
 * All lines share the same y axis, so winners climb, losers drop, and the
 * lines naturally separate, no more pile-up of overlapping labels at the
 * right edge.
 *
 * Timeframes (5m/1h/6h/24h) toggle which DexScreener `price_change_*`
 * field seeds the synthesized history and how long the window spans.
 * Switching timeframes drops the existing histories and re-seeds them
 * for the new window. Real samples replace synthesized ones as polls
 * arrive.
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
  const hitTargetsRef = useRef<
    Array<{ ca: string; symbol: string; x: number; y: number; w: number; h: number }>
  >([]);
  const hoverIdxRef = useRef<number | null>(null);
  const [cursor, setCursor] = useState<"default" | "pointer">("default");
  const router = useRouter();

  // Track whether the current theme is dark so the canvas grid + label
  // colors can swap. The canvas isn't a DOM element so it can't pick up
  // CSS vars — we read them once per resolved theme change instead.
  const [isDark, setIsDark] = useState(false);
  useEffect(() => {
    const root = document.documentElement;
    const compute = () => {
      const t = root.getAttribute("data-theme");
      // `light` is opt-in; everything else (`dark` or unset) is dark.
      setIsDark(t !== "light");
    };
    compute();
    const obs = new MutationObserver(compute);
    obs.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, []);
  const isDarkRef = useRef(isDark);
  isDarkRef.current = isDark;

  // Timeframe selector. Picks which DexScreener %-change field to seed
  // the synthesized history from + the chart's window length. The window
  // is also read by the draw loop, so this ref keeps it in sync without
  // re-running the rAF setup.
  const [tf, setTf] = useState<Timeframe>("1h");
  const tfRef = useRef<Timeframe>("1h");
  tfRef.current = tf;

  // When the timeframe changes, dump all histories. The synthesized
  // trajectories are keyed to the old window length, leaving them around
  // would make the chart misrender for a few seconds until they refill.
  useEffect(() => {
    histRef.current.clear();
  }, [tf]);

  // Update histories whenever the tokens prop or tf changes.
  useEffect(() => {
    const top = tokens.slice(0, limit);
    const now = Date.now();
    const seen = new Set<string>();
    const cfg = TF_MAP[tf];

    top.forEach((token) => {
      if (token.price_usd == null) return;
      seen.add(token.ca);
      const symbol = (token.symbol ?? "").replace(/^\$/, "").toUpperCase();
      const tfChange = (token[cfg.changeField] as number | null | undefined) ?? 0;
      const change24h = token.price_change_24h ?? 0;
      const existing = histRef.current.get(token.ca);

      if (!existing) {
        const samples = synthesizeHistory(
          token.price_usd,
          tfChange,
          cfg.windowMs,
          cfg.synthSamples,
        );
        histRef.current.set(token.ca, {
          ca: token.ca,
          symbol,
          samples,
          color: colorForCa(token.ca),
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
        existing.color = colorForCa(token.ca);
      }
    });

    for (const ca of Array.from(histRef.current.keys())) {
      if (!seen.has(ca)) histRef.current.delete(ca);
    }
  }, [tokens, limit, tf]);

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
      const targetW = Math.floor(rect.width * dpr);
      const targetH = Math.floor(rect.height * dpr);
      // Compare against the integer target, not raw rect.width * dpr,
      // so we don't reassign canvas.width every frame on fractional dpr
      // (each reassignment wipes the canvas + costs a layer rebuild).
      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
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
      const currentWindowMs = TF_MAP[tfRef.current].windowMs;
      const windowStart = now - currentWindowMs;

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
          const tFrac = (s.ts - windowStart) / currentWindowMs;
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
      // Theme-aware ink. Light theme uses near-black ink at low alpha;
      // dark theme uses near-white ink. Same opacity ramp in both so the
      // chart reads the same regardless of mode.
      const ink = isDarkRef.current ? "255, 255, 255" : "10, 10, 30";
      ctx.strokeStyle = `rgba(${ink}, 0.06)`;
      ctx.lineWidth = 1;
      ctx.font = "9px ui-monospace, monospace";
      ctx.fillStyle = `rgba(${ink}, 0.42)`;
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

      // Zero line, slightly stronger
      ctx.strokeStyle = `rgba(${ink}, 0.22)`;
      ctx.lineWidth = 1;
      const yZero = yForPct(0);
      ctx.beginPath();
      ctx.moveTo(padL, yZero);
      ctx.lineTo(padL + drawW, yZero);
      ctx.stroke();

      // Vertical time markers
      ctx.strokeStyle = `rgba(${ink}, 0.05)`;
      ctx.setLineDash([2, 4]);
      for (let i = 1; i < 4; i++) {
        const x = padL + (drawW / 4) * i;
        ctx.beginPath();
        ctx.moveTo(x, padT);
        ctx.lineTo(x, padT + drawH);
        ctx.stroke();
      }
      ctx.setLineDash([]);

      // Axis time labels. "x ago" needs to follow whatever timeframe the
      // chart is currently on — otherwise the chart contradicts itself.
      ctx.fillStyle = `rgba(${ink}, 0.42)`;
      ctx.font = "9px ui-monospace, monospace";
      ctx.textBaseline = "alphabetic";
      ctx.textAlign = "left";
      ctx.fillText(`${TF_MAP[tfRef.current].label} ago`, padL, h - 4);
      ctx.textAlign = "right";
      ctx.fillText("now", padL + drawW, h - 4);

      // ── Lines ──
      // Compute final y for each trace
      for (const trace of traces) {
        for (const p of trace.points) p.y = yForPct(p.pct);
      }

      // Hover state: when the user is over a label, brighten that line and
      // dim the others. Index matches `labels` ordering (assigned below).
      // We need the same index here so the hovered trace can be matched.
      // labels[i].trace === traces[?], so walk the labels list to find the
      // hovered trace identity.
      const hoveredCa = (() => {
        const idx = hoverIdxRef.current;
        if (idx == null) return null;
        const t = hitTargetsRef.current[idx];
        return t?.ca ?? null;
      })();

      // Helper to build the line path so the fill + stroke share geometry.
      const buildPath = (pts: { x: number; y: number }[]) => {
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length - 1; i++) {
          const cx = (pts[i].x + pts[i + 1].x) / 2;
          const cy = (pts[i].y + pts[i + 1].y) / 2;
          ctx.quadraticCurveTo(pts[i].x, pts[i].y, cx, cy);
        }
        ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
      };

      // Draw fills first so strokes always sit on top of them. Each trace
      // closes its path down to the zero line (yZero) so the gradient
      // visualizes the "% above/below 0" envelope, not "% above the chart
      // bottom" which is meaningless on a shared %-axis. When the line is
      // dipped below 0 it fills downward, above 0 it fills upward.
      for (const trace of traces) {
        const pts = trace.points;
        if (pts.length < 2) continue;
        const isOther = hoveredCa != null && trace.hist.ca !== hoveredCa;
        const dim = isOther ? 0.18 : 1;
        // Vertical gradient: strong near the line, fades to fully
        // transparent at the zero line. Re-derived per trace so the color
        // tints correctly.
        const grad = ctx.createLinearGradient(0, padT, 0, padT + drawH);
        const c = trace.hist.color;
        // Top of envelope → 22% alpha, fading to 0 toward the zero line.
        grad.addColorStop(0, hexToRgba(c, 0.22 * dim));
        grad.addColorStop(1, hexToRgba(c, 0));
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(pts[0].x, yZero);
        ctx.lineTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length - 1; i++) {
          const cx = (pts[i].x + pts[i + 1].x) / 2;
          const cy = (pts[i].y + pts[i + 1].y) / 2;
          ctx.quadraticCurveTo(pts[i].x, pts[i].y, cx, cy);
        }
        ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
        ctx.lineTo(pts[pts.length - 1].x, yZero);
        ctx.closePath();
        ctx.fill();
      }

      // Draw strokes on top of fills.
      for (const trace of traces) {
        const pts = trace.points;
        if (pts.length < 2) continue;
        const isHovered = hoveredCa === trace.hist.ca;
        const isOther = hoveredCa != null && !isHovered;

        ctx.strokeStyle = trace.hist.color;
        ctx.globalAlpha = isOther ? 0.25 : 1;
        ctx.lineWidth = isHovered ? 2.2 : 1.6;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.shadowColor = trace.hist.color;
        ctx.shadowBlur = isHovered ? 6 : 3;
        buildPath(pts);
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
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

      // Draw labels. Reset the hit-target list every frame and rebuild it
      // so click handlers always operate on the current visible positions.
      const hits: Array<{
        ca: string;
        symbol: string;
        x: number;
        y: number;
        w: number;
        h: number;
      }> = [];
      ctx.font = "bold 11px ui-sans-serif, system-ui, sans-serif";
      ctx.textBaseline = "middle";
      ctx.textAlign = "left";
      for (let labIdx = 0; labIdx < labels.length; labIdx++) {
        const lab = labels[labIdx];
        const isHovered = hoveredCa === lab.trace.hist.ca;
        const isOther = hoveredCa != null && !isHovered;
        const labelAlpha = isOther ? 0.32 : 1;

        // Tip dot at the actual line end. Hovered traces get a haloed
        // dot so the focused line literally glows.
        const tip = lab.trace.points[lab.trace.points.length - 1];
        ctx.globalAlpha = labelAlpha;
        ctx.fillStyle = lab.trace.hist.color;
        ctx.beginPath();
        ctx.arc(tip.x, tip.y, isHovered ? 3.6 : 2.6, 0, Math.PI * 2);
        ctx.fill();
        if (isHovered) {
          ctx.globalAlpha = 0.35;
          ctx.beginPath();
          ctx.arc(tip.x, tip.y, 6, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = labelAlpha;

        // Connector from tip to label if they got displaced
        if (Math.abs(tip.y - lab.y) > 2) {
          ctx.strokeStyle = lab.trace.hist.color;
          ctx.globalAlpha = labelAlpha * 0.4;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(tip.x + 3, tip.y);
          ctx.lineTo(tip.x + 8, lab.y);
          ctx.stroke();
          ctx.globalAlpha = labelAlpha;
        }

        // Symbol — measure first for the hit target, optionally underlined
        // when hovered. `isHovered` is shared with the line-render block so
        // hover state on the canvas matches hover state on the label.
        const symW = ctx.measureText(lab.trace.hist.symbol).width;
        ctx.fillStyle = lab.trace.hist.color;
        ctx.fillText(lab.trace.hist.symbol, tip.x + 10, lab.y);
        if (isHovered) {
          // Soft underline so the user sees it's a link.
          ctx.strokeStyle = lab.trace.hist.color;
          ctx.globalAlpha = labelAlpha * 0.6;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(tip.x + 10, lab.y + 7);
          ctx.lineTo(tip.x + 10 + symW, lab.y + 7);
          ctx.stroke();
          ctx.globalAlpha = labelAlpha;
        }

        // % since window start
        const pct = lab.trace.endPct;
        ctx.fillStyle = pct >= 0 ? "#0a8f57" : "#c1374a";
        ctx.font = "bold 10px ui-monospace, monospace";
        const pctStr = `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`;
        ctx.fillText(pctStr, tip.x + 10 + symW + 6, lab.y);
        const pctW = ctx.measureText(pctStr).width;
        ctx.font = "bold 11px ui-sans-serif, system-ui, sans-serif";

        // Hit target spans symbol + space + % so the whole label is
        // clickable, not just the four-letter symbol.
        hits.push({
          ca: lab.trace.hist.ca,
          symbol: lab.trace.hist.symbol,
          x: tip.x + 8,
          y: lab.y - 9,
          w: symW + 6 + pctW + 6,
          h: 18,
        });
      }
      ctx.globalAlpha = 1;
      hitTargetsRef.current = hits;
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  return (
    <div
      // backdrop-filter on a parent of a <canvas> can leave Chrome
      // sampling the wrong compositor layer on re-render (the canvas
      // area went black after switching timeframes). Layering a solid
      // base color below the gradient gives us the same glassmorphic
      // look without the bug.
      className="w-full rounded-2xl border border-border-subtle overflow-hidden relative"
      style={{
        background:
          "linear-gradient(180deg, var(--glass-strong), var(--glass-medium)), var(--bg-primary)",
        boxShadow:
          "0 1px 0 rgba(255,255,255,0.08) inset, 0 8px 28px rgba(10, 10, 30, 0.06)",
      }}
    >
      <div className="flex items-center justify-between px-4 pt-3.5 pb-1.5 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span className="relative flex size-1.5">
            <span className="absolute inline-flex h-full w-full rounded-full bg-accent-pulse opacity-75 animate-ping" />
            <span className="relative inline-flex size-1.5 rounded-full bg-accent-pulse" />
          </span>
          <span className="text-[9.5px] uppercase tracking-[0.22em] text-text-secondary font-bold">
            Live · top movers · {TF_MAP[tf].label}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* Timeframe pills. Each maps to a DexScreener %-change field
              (5m / 1h / 6h / 24h) and a corresponding window length on
              the chart. Switching tfs blanks the synthesized histories
              and re-seeds them so traces align with the new window. */}
          <div className="flex gap-0.5 rounded-full p-0.5 bg-text-muted/[0.06]">
            {(["5m", "1h", "6h", "24h"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTf(t)}
                className="px-2 py-0.5 rounded-full text-[9.5px] font-bold uppercase tracking-[0.12em] transition"
                style={{
                  background:
                    tf === t ? "var(--text-primary)" : "transparent",
                  color:
                    tf === t ? "var(--bg-primary)" : "var(--text-muted)",
                }}
              >
                {t}
              </button>
            ))}
          </div>
          <span className="text-[9.5px] uppercase tracking-[0.18em] text-text-muted">
            % since {TF_MAP[tf].label} ago
          </span>
        </div>
      </div>
      <canvas
        ref={canvasRef}
        style={{ display: "block", width: "100%", height: 132, cursor }}
        onMouseMove={(e) => {
          const canvas = e.currentTarget;
          const rect = canvas.getBoundingClientRect();
          const x = ((e.clientX - rect.left) / rect.width) * canvas.width / (window.devicePixelRatio || 1);
          const y = ((e.clientY - rect.top) / rect.height) * canvas.height / (window.devicePixelRatio || 1);
          const idx = hitTargetsRef.current.findIndex(
            (t) => x >= t.x && x <= t.x + t.w && y >= t.y && y <= t.y + t.h,
          );
          const next = idx >= 0 ? idx : null;
          if (hoverIdxRef.current !== next) {
            hoverIdxRef.current = next;
            setCursor(next != null ? "pointer" : "default");
          }
        }}
        onMouseLeave={() => {
          hoverIdxRef.current = null;
          setCursor("default");
        }}
        onClick={(e) => {
          const canvas = e.currentTarget;
          const rect = canvas.getBoundingClientRect();
          const x = ((e.clientX - rect.left) / rect.width) * canvas.width / (window.devicePixelRatio || 1);
          const y = ((e.clientY - rect.top) / rect.height) * canvas.height / (window.devicePixelRatio || 1);
          const hit = hitTargetsRef.current.find(
            (t) => x >= t.x && x <= t.x + t.w && y >= t.y && y <= t.y + t.h,
          );
          if (hit) {
            router.push(`/token/${hit.ca}`);
          }
        }}
      />
    </div>
  );
}

/**
 * Build a synthetic windowMs-ago → current trajectory from a single
 * %-change figure (5m / 1h / 6h / 24h whichever the active timeframe
 * picks). Gets gradually replaced by real samples as time passes.
 *
 * Noise budget is intentionally tiny. For high-%change tokens (BTS at
 * +2500%, etc.) scaling noise by `|currentPrice - startPrice|` blew the
 * line into a jagged saw, because at the early samples the trend price
 * is a small fraction of the current price and the noise dwarfed it.
 * Noise is now anchored to the LOCAL trend value, so jitter is ~0.4%
 * of whatever price the trend sits at — visible texture, never chunky.
 */
function synthesizeHistory(
  currentPrice: number,
  changePct: number,
  windowMs: number,
  count: number,
): Sample[] {
  const startPrice = currentPrice / (1 + changePct / 100);
  const now = Date.now();
  const out: Sample[] = [];
  for (let i = 0; i < count; i++) {
    const tFrac = i / (count - 1);
    // Smootherstep, slightly more S-shaped than smoothstep for nicer
    // build-up on long windows.
    const eased = tFrac * tFrac * tFrac * (tFrac * (tFrac * 6 - 15) + 10);
    const trend = startPrice + (currentPrice - startPrice) * eased;
    // Noise relative to local price → never blows up on parabolic tokens.
    const noiseAmp = Math.max(Math.abs(trend), currentPrice * 0.001) * 0.004;
    const noise = (Math.random() - 0.5) * 2 * noiseAmp;
    out.push({
      ts: now - windowMs * (1 - tFrac),
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
