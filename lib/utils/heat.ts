import type { TrendingToken } from "@/types/token";

/**
 * Heat score from a list of trending tokens — derived from average absolute
 * 24h % change. Volume isn't a great cross-time signal because the trending
 * seed list is curated and roughly stable, but volatility scales naturally
 * with how active the market is.
 *
 * Returns a value in [0, 1]. 0% avg movement → 0, 15%+ avg movement → 1.
 */
export function computeHeat(tokens: TrendingToken[]): number {
  if (!tokens.length) return 0.2;
  const samples = tokens
    .map((t) => Math.abs(t.price_change_24h ?? 0))
    .filter((n) => Number.isFinite(n));
  if (samples.length === 0) return 0.2;
  const avg = samples.reduce((s, n) => s + n, 0) / samples.length;
  return Math.max(0, Math.min(1, avg / 15));
}

/** Map heat (0..1) into a calm BPM range — 50 at rest, 85 when on fire. */
export function heatToBpm(heat: number): number {
  return 50 + heat * 35;
}

/** Discrete label for UI badges. */
export function heatLabel(bpm: number): "Calm" | "Steady" | "Active" | "Hot" | "On fire" {
  if (bpm >= 110) return "On fire";
  if (bpm >= 78) return "Hot";
  if (bpm >= 66) return "Active";
  if (bpm >= 56) return "Steady";
  return "Calm";
}
