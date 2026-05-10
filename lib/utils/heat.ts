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

// Recalibrated AGAIN — third time's the charm. Previous formula had
// `extreme = mean(top-3 |%moves|) / 80` weighted 40%, which meant any
// trending list with ONE fresh launch at +500% pegged extreme at 1.0 and
// pushed BPM to 199. That's wrong: a memecoin doing +500% is the median
// Solana day, not Trump-tier.
//
// New anchoring philosophy: BPM 199 = "the entire ecosystem is screaming."
// Trump-token-tier. SOL-pumping-25%-tier. Achieved when MULTIPLE signals
// max out simultaneously, not one outlier.
//
//   heat = sol*0.40 + breadth*0.30 + volume*0.20 + extreme*0.10
//
// SOL macro is the anchor. When SOL itself moves significantly, the
// whole Solana ecosystem moves with it. That's the canonical signal.
// Extreme (fresh-launch parabolic energy) is now hard-capped at 0.10
// total contribution — it can lift the BPM by ~10 points but can't
// drive it alone. Breadth uses STRICT 24h moves (drops fresh launches
// with null 24h), threshold raised so fresh-launch noise doesn't game
// the score.
//
// BPM curve: heat^1.4 (was heat^0.85). The exponent > 1 means the BPM
// reaches for the high end — heat must be 0.92+ to clear 180. Hitting
// 199 requires heat 0.99+ which only happens when SOL is breaking its
// 24h record and 90%+ of established tokens are moving.
const SOL_REF = 25;                 // |% SOL 24h| at which sol = 1
const BREADTH_THRESHOLD = 15;       // % 24h move that counts as "meaningful"
const VOLATILITY_REF = 30;          // median |% 24h| at which volatility = 1
const VOLUME_REF = 1_000_000_000;   // $1B total trending vol at which volume = 1 (log)
const SENTIMENT_REF = 12;
const EXTREME_PARABOLIC_PCT = 500;  // tokens above this contribute to fresh-extreme tally

/**
 * Pick the freshest non-null %-change. Used for the topMover/biggestDump
 * spotlights and the volatility median. The HEAT components themselves
 * use strict 24h to avoid fresh-launch noise.
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

  // STRICT 24h changes for the heat components. Fresh launches that report
  // null for 24h drop out of these calcs, that's intentional — we don't
  // want a token that's existed for 4 hours dominating "the macro reads."
  const strict24h = tokens
    .map((t) => t.price_change_24h)
    .filter((c): c is number => c != null && Number.isFinite(c));

  const volumes = tokens
    .map((t) => t.volume_24h ?? 0)
    .filter((v) => Number.isFinite(v));

  // Fall-through changes for spotlight movers + sentiment context.
  const flexChanges = tokens
    .map(bestChange)
    .filter((c): c is number => c != null && Number.isFinite(c));

  // ── SOL macro anchor (40%) ───────────────────────────────────────────
  // The canonical Solana sentiment. When SOL itself rips or dumps, the
  // entire ecosystem moves. Always bigger signal than any individual meme.
  const solChange = sol?.price_change_24h ?? 0;
  const solComponent = clamp01(Math.abs(solChange) / SOL_REF);

  // ── Breadth (30%) ────────────────────────────────────────────────────
  // Fraction of tokens with strict-24h |%| > 15%. Excludes tokens too
  // young to have a 24h baseline, so fresh-launch noise can't game it.
  // 90%+ breadth is an "everyone's moving" read; that's rare and earned.
  const breadth =
    strict24h.length > 0
      ? strict24h.filter((c) => Math.abs(c) > BREADTH_THRESHOLD).length /
        strict24h.length
      : 0;

  // ── Volume (20%) ─────────────────────────────────────────────────────
  // Total trending 24h volume, log-normalized to $1B. Solana DEX daily
  // volume usually $500M-$2B, so the typical day reads 0.85 here. Volume
  // saturates fastest of all components — it's a tiebreaker, not the
  // primary signal.
  const totalVolume = volumes.reduce((s, n) => s + n, 0);
  const volume =
    totalVolume > 0
      ? clamp01(Math.log10(totalVolume + 1) / Math.log10(VOLUME_REF))
      : 0;

  // ── Extreme (10%, hard-capped) ───────────────────────────────────────
  // Fresh-launch parabolic energy. Uses the FLEX changes (so fresh launches
  // count) but is hard-capped at 0.10 total weight. One token at +9999% can
  // contribute ~10 BPM, can't alone drive the read into "Extreme."
  const parabolicCount = flexChanges.filter(
    (c) => Math.abs(c) >= EXTREME_PARABOLIC_PCT,
  ).length;
  // Saturates at 5 parabolic tokens.
  const extreme = clamp01(parabolicCount / 5);

  // ── Volatility (kept for breakdown display, NOT in heat formula) ─────
  // Still surfaced via HeatBreakdown so users see the spread, but folded
  // into breadth/extreme above for the actual heat math.
  const absChanges = strict24h.map(Math.abs);
  const sortedAbs = [...absChanges].sort((a, b) => a - b);
  const mid = Math.floor(sortedAbs.length / 2);
  const median =
    sortedAbs.length === 0
      ? 0
      : sortedAbs.length % 2 === 0
        ? (sortedAbs[mid - 1] + sortedAbs[mid]) / 2
        : sortedAbs[mid];
  const volatility = clamp01(median / VOLATILITY_REF);

  // ── Composite heat ──
  const heat = clamp01(
    solComponent * 0.40 +
      breadth * 0.30 +
      volume * 0.20 +
      extreme * 0.10,
  );

  // ── Sentiment ────────────────────────────────────────────────────────
  // Average signed change of the strict 24h set, falling back to flex when
  // strict is empty (very young trending list).
  const sentimentSet = strict24h.length > 0 ? strict24h : flexChanges;
  const avgChange =
    sentimentSet.length > 0
      ? sentimentSet.reduce((s, n) => s + n, 0) / sentimentSet.length
      : 0;
  const sentiment = Math.max(-1, Math.min(1, avgChange / SENTIMENT_REF));

  const greenCount = flexChanges.filter((c) => c > 0).length;
  const redCount = flexChanges.filter((c) => c < 0).length;

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
 * Heart rate mapping with a CONCAVE-UP curve, heat^1.4 means the BPM hangs
 * around the middle of the range until heat is genuinely high. The user
 * called out that 199 BPM should be Trump-token-tier, not "AGIGUY pumped",
 * so the curve makes the upper end actually rare.
 *
 *   heat 0.20 → 56 BPM    Calm
 *   heat 0.40 → 80 BPM    Steady
 *   heat 0.60 → 116 BPM   Active
 *   heat 0.75 → 145 BPM   Hot
 *   heat 0.85 → 168 BPM   On fire
 *   heat 0.92 → 185 BPM   On fire
 *   heat 0.96 → 192 BPM   Extreme
 *   heat 0.99 → 198 BPM   Extreme   ← Trump-token-tier requires this
 *   heat 1.00 → 200 BPM   Cardiac
 */
export function heatToBpm(heat: number): number {
  const h = Math.max(0, Math.min(1, heat));
  return 40 + Math.pow(h, 1.4) * 160;
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
