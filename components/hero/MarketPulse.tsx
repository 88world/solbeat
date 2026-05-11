"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { animate } from "animejs";
import type { HeatSnapshot } from "@/lib/utils/heat";
import { heatToBpm, heatLabel } from "@/lib/utils/heat";
import { humanizeNumber, humanizePrice, pctChange } from "@/lib/utils";
import type { TrendingToken } from "@/types/token";
import { ECGTrace } from "./ECGTrace";
import { HeartWave } from "./HeartWave";

/**
 * Market vitals, concrete numbers a Solana trader actually scans for, no
 * abstract "Volatility / Breadth / Volume" bars:
 *
 *   - ECG trace at the top, scrolling at the live BPM cadence
 *   - Big tabular-num BPM with heat-colored glow
 *   - Sentiment direction + gainers/losers split
 *   - SOL price + 24h % (the macro reference everyone watches)
 *   - 24h trending volume (sum across the visible movers)
 *   - Top mover + biggest dump pulled from trending
 */
export function MarketPulse({ pulse }: { pulse: HeatSnapshot | null }) {
  const [displayBpm, setDisplayBpm] = useState(55);
  // Lazy initializer — `Date.now()` is impure in render, but inside the
  // `() => …` form it only fires once on mount, which is what we want.
  const [lastTick, setLastTick] = useState(() => Date.now());
  const [secondsAgo, setSecondsAgo] = useState(0);
  const bpmRef = useRef<HTMLSpanElement>(null);
  const prevHeatRef = useRef(0);

  // Smooth BPM toward target via lerp.
  useEffect(() => {
    const target = pulse ? heatToBpm(pulse.heat) : 55;
    let raf = 0;
    const step = () => {
      setDisplayBpm((v) => {
        const next = v + (target - v) * 0.08;
        if (Math.abs(next - target) < 0.4) return target;
        raf = requestAnimationFrame(step);
        return next;
      });
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [pulse]);

  // On every meaningful heat update, flash the BPM and bookmark the tick time.
  useEffect(() => {
    if (!pulse) return;
    const prev = prevHeatRef.current;
    if (Math.abs(pulse.heat - prev) > 0.005) {
      prevHeatRef.current = pulse.heat;
      setLastTick(Date.now());
      const el = bpmRef.current;
      if (el) {
        // anime.js text-shadow flash. Brief brightening then back to baseline.
        // Up-tick (heat increased) flashes pink; down-tick flashes indigo.
        const direction = pulse.heat > prev ? "up" : "down";
        const flashColor = direction === "up" ? "#FF2D9C" : "#5e5cff";
        // Pulse magnitude scales with how big the heat jump was: a +0.1
        // jump is a real surge (and a sharper scale-pop), a +0.005 nudge
        // is just polling jitter and stays small.
        const jump = Math.min(1, Math.abs(pulse.heat - prev) / 0.1);
        const peakScale = 1 + 0.035 * jump;
        animate(el, {
          textShadow: [
            `0 0 0px ${flashColor}00, 0 0 0px ${flashColor}00`,
            `0 0 28px ${flashColor}cc, 0 0 6px ${flashColor}aa`,
            `0 0 24px ${flashColor}33, 0 0 4px ${flashColor}55`,
          ],
          // Quick punch up, slow settle back. The number "breathes" on
          // each meaningful market update without ever looking jittery.
          scale: [1, peakScale, 1],
          duration: 760,
          ease: "out(3)",
        });
      }
    }
  }, [pulse]);

  // "Updated Xs ago" tick.
  useEffect(() => {
    const id = setInterval(() => {
      setSecondsAgo(Math.floor((Date.now() - lastTick) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [lastTick]);

  // ── Easter egg: Trump-tier event ──────────────────────────────────────
  // When BPM crosses 190 (the ceiling the heat math now reserves for
  // "the entire ecosystem is screaming") we fire a one-time page-wide
  // pulse + a glowing badge near the BPM. The threshold is rare by
  // design — heat=0.96+ requires SOL macro + breadth + volume + at least
  // one parabolic launch all firing at once. When it triggers, the user
  // remembers it. (Compare: "I was online when Trump released the coin.")
  const [trumpTier, setTrumpTier] = useState(false);
  const wasTrumpRef = useRef(false);
  useEffect(() => {
    const isTrump = displayBpm >= 190;
    if (isTrump && !wasTrumpRef.current) {
      wasTrumpRef.current = true;
      setTrumpTier(true);
      // Fire a page-wide flash by appending a CSS class to <html>. The
      // class auto-removes after the keyframe completes so subsequent
      // re-triggers (very rare) still fire.
      const root = document.documentElement;
      root.classList.add("solbeat-trump-flash");
      setTimeout(() => root.classList.remove("solbeat-trump-flash"), 2200);
    } else if (!isTrump && wasTrumpRef.current && displayBpm < 175) {
      // Hysteresis: only un-arm once we've come back down below 175,
      // so a 189 ↔ 190 oscillation doesn't strobe.
      wasTrumpRef.current = false;
      setTrumpTier(false);
    }
  }, [displayBpm]);

  if (!pulse) return <Skeleton />;

  const bpm = Math.round(displayBpm);
  const label = heatLabel(bpm);
  const labelColor = pickLabelColor(label);
  const bullish = pulse.sentiment >= 0;
  const sentimentColor = bullish ? "#0a8f57" : "#c1374a";
  // Trace color escalates with heat — extreme markets render in pink-red,
  // calm markets in indigo so the trace itself reads the temperature.
  const traceColor =
    label === "Extreme"
      ? "#c1374a"
      : label === "On fire"
        ? "#FF2D9C"
        : bullish
          ? "#FF2D9C"
          : "#FF4757";

  return (
    <div
      className="relative rounded-2xl border border-border-subtle p-4 backdrop-blur-md w-full max-w-sm overflow-hidden"
      style={{
        background:
          "linear-gradient(180deg, var(--glass-strong), var(--glass-medium))",
        boxShadow:
          "0 1px 0 rgba(255,255,255,0.7) inset, 0 8px 28px rgba(10, 10, 30, 0.06)",
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <span className="relative flex size-1.5">
            <span
              className="absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping"
              style={{ background: bullish ? "#14F195" : "#FF4757" }}
            />
            <span
              className="relative inline-flex size-1.5 rounded-full"
              style={{ background: bullish ? "#14F195" : "#FF4757" }}
            />
          </span>
          <span className="text-[9.5px] uppercase tracking-[0.22em] text-text-secondary font-bold">
            Market Pulse
          </span>
        </div>
        <span
          className="text-[9.5px] uppercase tracking-[0.18em] text-text-muted text-mono"
          title={`Last update ${secondsAgo}s ago`}
        >
          {secondsAgo < 5 ? "live · just now" : `updated ${secondsAgo}s ago`}
        </span>
      </div>

      {/* ECG */}
      <div className="mb-3 -mx-1">
        <ECGTrace
          bpm={bpm}
          width={320}
          height={56}
          color={traceColor}
          heat={pulse.heat}
        />
      </div>

      {/* Trump-tier banner. Only renders at BPM ≥ 190. */}
      {trumpTier && (
        <div
          className="absolute top-2 left-1/2 -translate-x-1/2 z-30 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[9.5px] font-black uppercase tracking-[0.22em]"
          style={{
            background: "rgba(255, 71, 87, 0.12)",
            color: "#c1374a",
            border: "1px solid rgba(255, 71, 87, 0.45)",
            boxShadow: "0 0 16px rgba(255, 71, 87, 0.45)",
            animation: "trump-pip-pulse 1.4s cubic-bezier(0.22,1,0.36,1) infinite",
          }}
        >
          <span aria-hidden>🚨</span> Trump-tier event
        </div>
      )}

      {/* BPM hero row */}
      <div className="flex items-end gap-3 mb-3">
        <div className="flex items-baseline gap-1.5">
          <span
            ref={bpmRef}
            className="text-[44px] sm:text-[52px] font-black text-mono tabular-nums leading-none"
            style={{
              color: labelColor,
              textShadow: `0 0 24px ${labelColor}33, 0 0 4px ${labelColor}55`,
              letterSpacing: "-0.04em",
              // inline-block so the anime.js scale transform applies; bottom
              // origin keeps the baseline planted so the BPM label below
              // doesn't bob on each pop.
              display: "inline-block",
              transformOrigin: "left bottom",
            }}
          >
            {bpm}
          </span>
          <span className="text-[11px] uppercase tracking-[0.2em] text-text-muted font-bold pb-2">
            BPM
          </span>
        </div>
        <div className="ml-auto text-right pb-1">
          <div
            className="text-[10.5px] uppercase tracking-[0.18em] font-bold"
            style={{ color: labelColor }}
          >
            {label}
          </div>
          <div
            className="flex items-center gap-1 font-mono text-[12.5px] font-bold justify-end leading-none mt-1"
            style={{ color: sentimentColor }}
          >
            <span aria-hidden>{bullish ? "↑" : "↓"}</span>
            <span>{pctChange(pulse.avgChange)}</span>
          </div>
          <div className="text-[10px] text-mono text-text-muted mt-1">
            <span className="text-signal-positive font-semibold">
              {pulse.greenCount}↑
            </span>
            {"  "}
            <span className="text-signal-negative font-semibold">
              {pulse.redCount}↓
            </span>
          </div>
        </div>
      </div>

      {/* Heat waveform — Gemini called out that progress bars aren't a
          heartbeat, replaced with a Canvas2D continuous wave whose shape
          IS the four heat components summed as sine carriers. SOL macro is
          the slow underlying current, breadth is the chorus, volume is the
          chatter, extreme spawns sharp gaussian spikes when fresh launches
          rip. Lives, breathes, and reads the market state literally. */}
      <HeatWaveDisplay pulse={pulse} />

      {/* SOL macro + 24h volume */}
      <div className="rounded-xl border border-border-subtle px-3 py-2.5 mb-3 bg-text-muted/[0.03]">
        {pulse.sol ? (
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-1.5">
              <span className="text-[12px]" aria-hidden>◎</span>
              <span className="text-[10px] uppercase tracking-[0.16em] text-text-muted font-bold">
                SOL
              </span>
              <span className="text-[13px] font-bold text-text-primary text-mono tabular-nums">
                {humanizePrice(pulse.sol.price_usd)}
              </span>
            </div>
            {pulse.sol.price_change_24h != null && (
              <span
                className="text-[12px] font-mono font-bold"
                style={{
                  color:
                    pulse.sol.price_change_24h >= 0 ? "#0a8f57" : "#c1374a",
                }}
              >
                {pulse.sol.price_change_24h >= 0 ? "↑ " : "↓ "}
                {pctChange(pulse.sol.price_change_24h)}
              </span>
            )}
          </div>
        ) : null}
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-[0.16em] text-text-muted font-bold">
            24h vol
          </span>
          <span className="text-[12px] font-mono font-bold text-text-secondary tabular-nums">
            ${humanizeNumber(pulse.totalVolume, 1)}
          </span>
        </div>
      </div>

      {/* Movers */}
      <div className="grid grid-cols-2 gap-3 text-[11px]">
        <Mover token={pulse.topMover} positive />
        <Mover token={pulse.biggestDump} positive={false} />
      </div>
    </div>
  );
}

function Mover({
  token,
  positive,
}: {
  token: TrendingToken | null;
  positive: boolean;
}) {
  if (!token) {
    return (
      <div className="flex items-center gap-1.5 text-text-muted">
        <span className="text-[10px]">-</span>
      </div>
    );
  }
  const symbol = (token.symbol ?? "").replace(/^\$/, "").toUpperCase();
  const change = token.price_change_24h ?? 0;
  const changeColor = positive ? "text-signal-positive" : "text-signal-negative";
  return (
    <Link
      href={`/token/${token.ca}`}
      className="flex items-center gap-1.5 min-w-0 hover:opacity-80 transition-opacity"
      title={`Open ${symbol} on SolBeat`}
    >
      <span className={`text-[10px] font-bold ${changeColor}`} aria-hidden>
        {positive ? "▲" : "▼"}
      </span>
      <span className="font-bold text-text-primary text-[11px] truncate">
        {symbol}
      </span>
      <span className={`text-mono text-[11px] ml-auto font-semibold ${changeColor}`}>
        {pctChange(change)}
      </span>
    </Link>
  );
}

function pickLabelColor(label: ReturnType<typeof heatLabel>): string {
  switch (label) {
    case "Extreme": return "#c1374a"; // BV crimson, cardiac
    case "On fire": return "#d6601a"; // hot orange
    case "Hot":     return "#b8500a"; // amber
    case "Active":  return "#8a5800"; // mustard
    case "Steady":  return "#0a6f47"; // forest green
    case "Calm":    return "#0a8f57"; // mint
    default:        return "#0a8f57";
  }
}

/**
 * Live heat waveform display. Hands the four heat components to the
 * Canvas2D HeartWave which renders a continuous sine-stack as a single
 * fluid trace. Tiny inline labels under the wave name the components
 * with their current values + weights so the math is still legible.
 */
function HeatWaveDisplay({ pulse }: { pulse: HeatSnapshot }) {
  const solChange = Math.abs(pulse.sol?.price_change_24h ?? 0);
  const solComponent = Math.min(1, solChange / 25);
  const parabolic = [
    pulse.topMover?.price_change_24h,
    pulse.biggestDump?.price_change_24h,
  ].filter((c) => c != null && Math.abs(c) >= 500).length;
  const extreme = Math.min(1, parabolic / 5);

  return (
    <div className="rounded-xl bg-text-muted/[0.03] border border-border-subtle px-3 py-2.5 mb-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[9px] uppercase tracking-[0.20em] text-text-muted font-bold">
          Why this BPM
        </span>
        <span className="text-[8.5px] uppercase tracking-[0.20em] text-text-muted font-mono">
          {pulse.heat > 0.85
            ? "everything pumping"
            : pulse.heat > 0.65
              ? "broad rip"
              : pulse.heat > 0.4
                ? "selective heat"
                : "quiet"}
        </span>
      </div>
      <div className="-mx-1">
        <HeartWave
          heat={pulse.heat}
          sol={solComponent}
          breadth={pulse.breakdown.breadth}
          volume={pulse.breakdown.volume}
          extreme={extreme}
          width={300}
          height={70}
        />
      </div>
      <div className="grid grid-cols-4 gap-1 mt-1.5">
        <WaveLegend
          label="$SOL move"
          value={solComponent}
          color="#14F195"
          tooltip="How much SOL itself is moving in the last 24h. The whole ecosystem follows this."
        />
        <WaveLegend
          label="Tokens up"
          value={pulse.breakdown.breadth}
          color="#5e5cff"
          tooltip="Fraction of the trending list with meaningful 24h moves (>15%). 100 = everything's moving."
        />
        <WaveLegend
          label="$ flowing"
          value={pulse.breakdown.volume}
          color="#FFB938"
          tooltip="Log-scaled total trending volume vs $1B reference. 100 = market firing."
        />
        <WaveLegend
          label="Parabolic"
          value={extreme}
          color="#FF2D9C"
          tooltip="Count of fresh launches doing >500% moves. Hard-capped, extreme can't carry the read alone."
        />
      </div>
    </div>
  );
}

function WaveLegend({
  label,
  value,
  color,
  tooltip,
}: {
  label: string;
  value: number;
  color: string;
  tooltip: string;
}) {
  return (
    <div
      className="flex flex-col items-start gap-0.5 cursor-help"
      title={tooltip}
    >
      <div className="flex items-center gap-1">
        <span className="size-1.5 rounded-full" style={{ background: color }} />
        <span className="text-[8.5px] uppercase tracking-[0.14em] font-bold text-text-secondary leading-none">
          {label}
        </span>
      </div>
      <div className="flex items-baseline gap-1 leading-none">
        <span
          className="text-[14px] font-mono font-bold tabular-nums"
          style={{ color }}
        >
          {Math.round(value * 100)}
        </span>
      </div>
    </div>
  );
}

function Skeleton() {
  return (
    <div
      className="rounded-2xl border border-border-subtle p-4 w-full max-w-sm h-[260px]"
      style={{ background: "var(--glass-soft)" }}
    >
      <div className="h-3 w-24 rounded bg-text-muted/15 animate-shimmer mb-3" />
      <div className="h-14 w-full rounded bg-text-muted/10 animate-shimmer mb-4" />
      <div className="h-10 w-32 rounded bg-text-muted/15 animate-shimmer mb-3" />
      <div className="space-y-1.5">
        <div className="h-2 w-full rounded bg-text-muted/10 animate-shimmer" />
        <div className="h-2 w-full rounded bg-text-muted/10 animate-shimmer" />
      </div>
    </div>
  );
}
