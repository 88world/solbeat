import type { TrendingToken } from "@/types/token";
import type { SolMacro } from "@/lib/data/dexscreener";

/**
 * Heat is composed of three independent market signals:
 *
 *  - Volatility (50%), how *big* the moves are. Top-3 average of |24h %|,
 *    normalized to an 18% reference. Captures intensity without being
 *    distorted by a single outlier.
 *
 *  - Breadth (30%), how *many* tokens are moving meaningfully. Fraction of
 *    the trending list with |24h %| > 3. A market where one token rips
 *    while everything else sleeps reads cooler than one where everything
 *    is moving.
 *
 *  - Volume (20%), how much *money* is flowing. Log-scaled total 24h volume
 *    normalized to a $50M reference, so $5M reads ~50% and $500M reads ~110%
 *    (clamped to 1).
 *
 * Sentiment (direction) is computed separately. Heat is a magnitude, a hot
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
  sol: SolMacro | null;             // SOL price macro reference
};

// Recalibrated again. Previous version pegged at "tame" BPM (~80) even when
// the trending list was full of fresh launches doing +500%. The fix:
//   1. Add an EXTREME component (top-3 mean of |% move|) — captures the
//      "one coin is RIPPING" signal that median washes out.
//   2. Fall back through 6h → 1h → 24h when 24h is null. Fresh launches
//      under 24h old report null for 24h %; we were silently dropping them
//      from the heat calc, leaving only stale established tokens.
//   3. Lower volume ref to $100M (the trending sum routinely hits this).
//   4. Reweight: extreme=0.40, volatility=0.25, breadth=0.20, volume=0.15.
//      Single ripping token contributes meaningfully without being able to
//      saturate alone. Broad activity still pushes BPM into the 180s.
const VOLATILITY_REF = 12;         // median |%| at which volatility = 1
const EXTREME_REF = 80;            // top-3 mean |%| at which extreme = 1
const BREADTH_THRESHOLD = 8;       // % move that counts as "meaningful"
const VOLUME_REF = 100_000_000;    // $100M total at which volume = 1 (log)
const SENTIMENT_REF = 12;          // avg % at which sentiment saturates

/**
 * Pick the freshest non-null %-change available for a token. Order of
 * preference: 24h (most stable), 6h, 1h, 5m. Tokens younger than 24h often
 * report null for 24h, falling through to shorter windows keeps them
 * contributing to heat instead of disappearing.
 */
function bestChange(t: TrendingToken): number | null {
  const candidates = [
    t.price_change_24h,
    t.price_change_6h,
    t.price_change_1h,
    t.price_change_5m,
  ];
  for (const c of candidates) {
    if (c != null && Number.isFinite(c)) return c;
  }
  return null;
}

export function computeHeatSnapshot(
  tokens: TrendingToken[],
  sol: SolMacro | null = null,
): HeatSnapshot {
  if (!tokens.length) return { ...EMPTY_SNAPSHOT, sol };

  const changes = tokens
    .map(bestChange)
    .filter((c): c is number => c != null && Number.isFinite(c));
  const volumes = tokens
    .map((t) => t.volume_24h ?? 0)
    .filter((v) => Number.isFinite(v));

  if (changes.length === 0) return { ...EMPTY_SNAPSHOT, sol };

  // ── Volatility: median |%|. Robust to outliers, only saturates when the
  // whole list is moving.
  const absChanges = changes.map(Math.abs);
  const sortedAbs = [...absChanges].sort((a, b) => a - b);
  const mid = Math.floor(sortedAbs.length / 2);
  const median =
    sortedAbs.length % 2 === 0
      ? (sortedAbs[mid - 1] + sortedAbs[mid]) / 2
      : sortedAbs[mid];
  const volatility = clamp01(median / VOLATILITY_REF);

  // ── Extreme: mean of the top 3 movers' |%|. Captures parabolic single-
  // token energy. One coin at +500% should bend the BPM upward even if the
  // rest of the list is asleep, because that one coin IS the market right
  // now for whoever's watching.
  const top3 = sortedAbs.slice(-3);
  const top3Mean = top3.reduce((s, n) => s + n, 0) / Math.max(1, top3.length);
  const extreme = clamp01(top3Mean / EXTREME_REF);

  // ── Breadth: fraction of tokens with meaningful moves ──
  const moving = changes.filter((c) => Math.abs(c) > BREADTH_THRESHOLD).length;
  const breadth = moving / changes.length;

  // ── Volume: log-scaled total, normalized ──
  const totalVolume = volumes.reduce((s, n) => s + n, 0);
  const volume =
    totalVolume > 0
      ? clamp01(Math.log10(totalVolume + 1) / Math.log10(VOLUME_REF))
      : 0;

  // ── Composite heat. Extreme gets the largest weight because the user
  // feels one token going parabolic far more than they feel the median
  // moving from 4% to 6%. Volatility + breadth still anchor the broad
  // market read.
  const heat = clamp01(
    extreme * 0.40 +
      volatility * 0.25 +
      breadth * 0.20 +
      volume * 0.15,
  );

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
    const c = bestChange(t);
    if (c == null) continue;
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
    sol,
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
  sol: null,
};

/**
 * Heart rate mapping with a slight upward bias so parabolic markets actually
 * hit "extreme" (190+ BPM) instead of pegging at 180. heat^0.85 means low
 * heat moves more linearly while high heat reaches further:
 *
 *   heat 0.10 → 64 BPM    Calm
 *   heat 0.30 → 99 BPM    Steady
 *   heat 0.50 → 132 BPM   Active
 *   heat 0.70 → 161 BPM   Hot
 *   heat 0.85 → 181 BPM   On fire
 *   heat 0.95 → 194 BPM   Extreme
 *   heat 1.00 → 200 BPM   Cardiac
 */
export function heatToBpm(heat: number): number {
  const h = Math.max(0, Math.min(1, heat));
  return 40 + Math.pow(h, 0.85) * 160;
}

export function heatLabel(
  bpm: number,
): "Calm" | "Steady" | "Active" | "Hot" | "On fire" | "Extreme" {
  if (bpm >= 190) return "Extreme";
  if (bpm >= 160) return "On fire";
  if (bpm >= 120) return "Hot";
  if (bpm >= 90) return "Active";
  if (bpm >= 65) return "Steady";
  return "Calm";
}

/** Backwards-compat, heat-only when callers don't need the snapshot. */
export function computeHeat(tokens: TrendingToken[]): number {
  return computeHeatSnapshot(tokens).heat;
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}
