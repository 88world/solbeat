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

// Recalibrated so BPM actually moves with market state instead of pegging at
// max. Median-based volatility kills outlier saturation (one token at +287%
// can't drive heat alone, the market has to be broadly active). Volume
// reference raised from $50M → $250M because the trending list of 16 hot
// Solana tokens routinely sums north of that. Breadth threshold raised so it
// only counts meaningful moves.
const VOLATILITY_REF = 8;         // median |%| at which volatility = 1
const BREADTH_THRESHOLD = 5;      // % move that counts as "meaningful"
const VOLUME_REF = 250_000_000;   // $250M total at which volume = 1 (log)
const SENTIMENT_REF = 10;         // avg % at which sentiment saturates

export function computeHeatSnapshot(
  tokens: TrendingToken[],
  sol: SolMacro | null = null,
): HeatSnapshot {
  if (!tokens.length) return { ...EMPTY_SNAPSHOT, sol };

  const changes = tokens
    .map((t) => t.price_change_24h)
    .filter((c): c is number => c != null && Number.isFinite(c));
  const volumes = tokens
    .map((t) => t.volume_24h ?? 0)
    .filter((v) => Number.isFinite(v));

  if (changes.length === 0) return EMPTY_SNAPSHOT;

  // ── Volatility: median |%| ──
  // Median is robust to outliers (one mooning token can't blow it up alone),
  // so this only saturates when the *whole list* is moving. That's the right
  // signal for "the market is hot" rather than "one coin pumped."
  const sortedAbs = changes.map(Math.abs).sort((a, b) => a - b);
  const mid = Math.floor(sortedAbs.length / 2);
  const median =
    sortedAbs.length % 2 === 0
      ? (sortedAbs[mid - 1] + sortedAbs[mid]) / 2
      : sortedAbs[mid];
  const volatility = clamp01(median / VOLATILITY_REF);

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
  // Weighted toward volatility because that's what degens *feel*. Breadth
  // catches "everything's moving." Volume is the smallest weight, it
  // saturates fastest (log scale) so it's a tiebreaker, not a primary signal.
  const heat = clamp01(volatility * 0.55 + breadth * 0.30 + volume * 0.15);

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
 * Real heartbeat range: 40..200 BPM. Maps to actual cardio zones a user knows
 * intuitively, resting / walking / jogging / running / sprinting.
 *   heat 0.1 → 56 BPM   (Calm,    resting)
 *   heat 0.3 → 88 BPM   (Steady,  walking briskly)
 *   heat 0.5 → 120 BPM  (Active,  jogging)
 *   heat 0.7 → 152 BPM  (Hot,     running)
 *   heat 0.9 → 184 BPM  (On fire, sprinting)
 */
export function heatToBpm(heat: number): number {
  return 40 + heat * 160;
}

export function heatLabel(
  bpm: number,
): "Calm" | "Steady" | "Active" | "Hot" | "On fire" {
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
