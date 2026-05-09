import type { TrendingToken } from "@/types/token";

/**
 * Heat is composed of three independent market signals:
 *
 *  - Volatility (50%) — how *big* the moves are. Top-3 average of |24h %|,
 *    normalized to an 18% reference. Captures intensity without being
 *    distorted by a single outlier.
 *
 *  - Breadth (30%) — how *many* tokens are moving meaningfully. Fraction of
 *    the trending list with |24h %| > 3. A market where one token rips
 *    while everything else sleeps reads cooler than one where everything
 *    is moving.
 *
 *  - Volume (20%) — how much *money* is flowing. Log-scaled total 24h volume
 *    normalized to a $50M reference, so $5M reads ~50% and $500M reads ~110%
 *    (clamped to 1).
 *
 * Sentiment (direction) is computed separately. Heat is a magnitude — a hot
 * market can be a rip OR a rug. The sphere uses heat for color temperature;
 * the MarketPulse panel surfaces sentiment + breadth + volume as their own
 * lines so the user understands *why* the market reads hot.
 */

export type HeatBreakdown = {
  volatility: number; // 0..1
  breadth: number;    // 0..1
  volume: number;     // 0..1
};

export type HeatSnapshot = {
  heat: number;                     // 0..1 composite
  breakdown: HeatBreakdown;
  sentiment: number;                // -1..+1 (bearish..bullish)
  avgChange: number;                // raw average % change across the list
  greenCount: number;
  redCount: number;
  totalVolume: number;              // sum of 24h volumes
  topMover: TrendingToken | null;
  biggestDump: TrendingToken | null;
};

const VOLATILITY_REF = 18;        // top-3 |%| at which volatility = 1
const BREADTH_THRESHOLD = 3;      // % move that counts as "meaningful"
const VOLUME_REF = 50_000_000;    // $50M total at which volume = 1 (log scale)
const SENTIMENT_REF = 10;         // avg % at which sentiment saturates

export function computeHeatSnapshot(tokens: TrendingToken[]): HeatSnapshot {
  if (!tokens.length) return EMPTY_SNAPSHOT;

  const changes = tokens
    .map((t) => t.price_change_24h)
    .filter((c): c is number => c != null && Number.isFinite(c));
  const volumes = tokens
    .map((t) => t.volume_24h ?? 0)
    .filter((v) => Number.isFinite(v));

  if (changes.length === 0) return EMPTY_SNAPSHOT;

  // ── Volatility: top-3 average of absolute changes ──
  const sortedAbs = changes.map(Math.abs).sort((a, b) => b - a);
  const top = sortedAbs.slice(0, Math.min(3, sortedAbs.length));
  const top3Avg = top.reduce((s, n) => s + n, 0) / top.length;
  const volatility = clamp01(top3Avg / VOLATILITY_REF);

  // ── Breadth: fraction of tokens with meaningful moves ──
  const moving = changes.filter((c) => Math.abs(c) > BREADTH_THRESHOLD).length;
  const breadth = moving / changes.length;

  // ── Volume: log-scaled total, normalized ──
  const totalVolume = volumes.reduce((s, n) => s + n, 0);
  const volume =
    totalVolume > 0
      ? clamp01(Math.log10(totalVolume + 1) / Math.log10(VOLUME_REF))
      : 0;

  // ── Composite heat ──
  const heat = clamp01(volatility * 0.5 + breadth * 0.3 + volume * 0.2);

  // ── Sentiment: average signed change ──
  const avgChange = changes.reduce((s, n) => s + n, 0) / changes.length;
  const sentiment = Math.max(-1, Math.min(1, avgChange / SENTIMENT_REF));

  const greenCount = changes.filter((c) => c > 0).length;
  const redCount = changes.filter((c) => c < 0).length;

  // ── Movers ──
  let topMover: TrendingToken | null = null;
  let biggestDump: TrendingToken | null = null;
  let maxChange = -Infinity;
  let minChange = Infinity;
  for (const t of tokens) {
    const c = t.price_change_24h;
    if (c == null || !Number.isFinite(c)) continue;
    if (c > maxChange) {
      maxChange = c;
      topMover = t;
    }
    if (c < minChange) {
      minChange = c;
      biggestDump = t;
    }
  }

  return {
    heat,
    breakdown: { volatility, breadth, volume },
    sentiment,
    avgChange,
    greenCount,
    redCount,
    totalVolume,
    topMover,
    biggestDump,
  };
}

const EMPTY_SNAPSHOT: HeatSnapshot = {
  heat: 0.18,
  breakdown: { volatility: 0.18, breadth: 0, volume: 0 },
  sentiment: 0,
  avgChange: 0,
  greenCount: 0,
  redCount: 0,
  totalVolume: 0,
  topMover: null,
  biggestDump: null,
};

/** BPM range now 50..100 (was 50..85) — wider so a hot market is meaningfully different. */
export function heatToBpm(heat: number): number {
  return 50 + heat * 50;
}

export function heatLabel(
  bpm: number,
): "Calm" | "Steady" | "Active" | "Hot" | "On fire" {
  if (bpm >= 110) return "On fire";
  if (bpm >= 85) return "Hot";
  if (bpm >= 72) return "Active";
  if (bpm >= 60) return "Steady";
  return "Calm";
}

/** Backwards-compat — heat-only when callers don't need the snapshot. */
export function computeHeat(tokens: TrendingToken[]): number {
  return computeHeatSnapshot(tokens).heat;
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}
