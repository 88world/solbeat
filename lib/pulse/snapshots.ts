import { cacheGet, cacheSet } from "@/lib/cache/redis";

/**
 * Pulse history. Every time a token gets analyzed (i.e. someone visits the
 * page and the slow-side resolves), we snapshot its current pulse state into
 * Redis. The token page then renders a small timeline so users can see how
 * the pulse evolved, "Mixed read 6h ago, Coordinated hype now."
 *
 * This is the moat. DexScreener and Birdeye show price history; nobody shows
 * synthesized verdict history. The first time someone sees their token's
 * "Coordinated hype" was flagged 4h ago and didn't go away, that's a signal
 * they couldn't get anywhere else.
 *
 * Storage: per-CA list capped at 48 entries (≈2 days at 1 snapshot/hour).
 * Backed by Upstash Redis when available, in-memory otherwise (the cacheSet
 * helper handles that fallback). TTL 7 days so cold tokens self-clean.
 */
export type PulseSnapshot = {
  /** Unix ms. */
  ts: number;
  price_usd: number | null;
  change_24h: number | null;
  /** 0-100, higher = riskier. */
  risk_score: number | null;
  risk_label: "SAFE" | "LOW" | "MODERATE" | "HIGH" | "EXTREME" | null;
  signal_text: string;
  signal_severity: "good" | "warn" | "bad" | "neutral";
  /** Up to 3 short tags for the most-loaded signals at this moment. */
  signals: string[];
};

const HISTORY_KEY = (ca: string) => `pulse_history:${ca}`;
const HISTORY_TTL_S = 60 * 60 * 24 * 7; // 7d
const MAX_ENTRIES = 48;
/** Don't append if the most recent snapshot is younger than this. */
const MIN_GAP_MS = 30 * 60 * 1000; // 30 min

export async function readPulseHistory(ca: string): Promise<PulseSnapshot[]> {
  const list = await cacheGet<PulseSnapshot[]>(HISTORY_KEY(ca));
  return Array.isArray(list) ? list : [];
}

/**
 * Append a snapshot if 30+ min have passed since the previous one. We dedupe
 * on time-gap rather than equality so the timeline shows steady progression
 * even when nothing materially changes.
 */
export async function appendPulseSnapshot(
  ca: string,
  snap: PulseSnapshot,
): Promise<void> {
  const existing = await readPulseHistory(ca);
  const last = existing[0];
  if (last && snap.ts - last.ts < MIN_GAP_MS) {
    return;
  }
  const updated = [snap, ...existing].slice(0, MAX_ENTRIES);
  await cacheSet(HISTORY_KEY(ca), updated, HISTORY_TTL_S);
}

/**
 * Compose a snapshot from a TokenAnalysis-shaped object. Pulled out so the
 * orchestrator can call it with whatever shape it has after the slow phase.
 */
export function composeSnapshot(input: {
  price_usd: number | null;
  change_24h: number | null;
  risk_score: number | null;
  risk_label: PulseSnapshot["risk_label"];
  signal_text: string;
  signal_severity: PulseSnapshot["signal_severity"];
  signals: string[];
}): PulseSnapshot {
  return {
    ts: Date.now(),
    ...input,
  };
}
