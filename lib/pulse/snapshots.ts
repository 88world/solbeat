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

/**
 * Inflection points from the snapshot history. The timeline shows what's
 * happened over time, but the user's eye lands on a chart and forgets to
 * read; an inflection is the one-liner that says "something flipped, look."
 *
 * Surfaces:
 *   - Severity flips (verdict went from good → warn, warn → bad, etc.)
 *   - Risk score deltas of 10+ points within the lookback
 *   - New signal labels that didn't exist before
 *   - Big price swings paired with severity changes
 *
 * Returns ordered by recency. Empty if there's no meaningful change.
 */
export type PulseInflection = {
  /** ms since epoch when the flip happened. */
  ts: number;
  /** Hours-ago string ("2h ago", "30m ago"). */
  ago: string;
  kind: "severity_flip" | "risk_jump" | "risk_drop" | "new_signal" | "price_swing";
  /** Plain-English one-liner. */
  text: string;
  /** Color for accent rendering. */
  severity: PulseSnapshot["signal_severity"];
};

const SEVERITY_RANK: Record<PulseSnapshot["signal_severity"], number> = {
  bad: 0,
  warn: 1,
  neutral: 2,
  good: 3,
};

export function detectInflections(history: PulseSnapshot[]): PulseInflection[] {
  if (history.length < 2) return [];

  // Snapshots arrive newest-first. Walk through pairs (newer, older) to
  // detect changes between them.
  const out: PulseInflection[] = [];
  const latest = history[0];

  // Compare latest against the closest snapshot from each lookback window.
  const lookbacks: Array<{ hours: number; label: string }> = [
    { hours: 1, label: "1h ago" },
    { hours: 6, label: "6h ago" },
    { hours: 24, label: "24h ago" },
  ];

  for (const lb of lookbacks) {
    const cutoff = latest.ts - lb.hours * 3_600_000;
    // Closest snapshot at or older than cutoff.
    const prev = history.find((s) => s.ts <= cutoff);
    if (!prev) continue;
    const ago = humanAgo(latest.ts - prev.ts);

    // Severity flip
    const newRank = SEVERITY_RANK[latest.signal_severity];
    const oldRank = SEVERITY_RANK[prev.signal_severity];
    if (newRank !== oldRank) {
      const direction = newRank < oldRank ? "deteriorated" : "improved";
      out.push({
        ts: prev.ts,
        ago,
        kind: "severity_flip",
        text: `Verdict ${direction} ${ago}: ${capitalize(prev.signal_severity)} → ${capitalize(latest.signal_severity)}.`,
        severity: latest.signal_severity,
      });
    }

    // Risk jump or drop (10+ points)
    if (
      latest.risk_score != null &&
      prev.risk_score != null &&
      Math.abs(latest.risk_score - prev.risk_score) >= 10
    ) {
      const diff = latest.risk_score - prev.risk_score;
      out.push({
        ts: prev.ts,
        ago,
        kind: diff > 0 ? "risk_jump" : "risk_drop",
        text: `Risk score ${diff > 0 ? "jumped" : "dropped"} ${Math.abs(diff)} points ${ago} (${prev.risk_score} → ${latest.risk_score}).`,
        severity: diff > 0 ? "warn" : "good",
      });
    }

    // New signal labels (the labels that weren't in `prev`)
    const prevSet = new Set(prev.signals);
    const newOnes = latest.signals.filter((s) => !prevSet.has(s));
    if (newOnes.length > 0 && lb.hours <= 6) {
      out.push({
        ts: prev.ts,
        ago,
        kind: "new_signal",
        text: `New signal${newOnes.length > 1 ? "s" : ""} ${ago}: ${newOnes.join(", ")}.`,
        severity: "neutral",
      });
    }

    // Significant price swing paired with verdict change
    if (
      latest.price_usd != null &&
      prev.price_usd != null &&
      prev.price_usd > 0
    ) {
      const swing = ((latest.price_usd - prev.price_usd) / prev.price_usd) * 100;
      if (Math.abs(swing) >= 25 && lb.hours <= 6) {
        out.push({
          ts: prev.ts,
          ago,
          kind: "price_swing",
          text: `Price ${swing >= 0 ? "+" : ""}${swing.toFixed(0)}% ${ago}.`,
          severity: swing >= 0 ? "good" : "bad",
        });
      }
    }
  }

  // Dedupe by `text`, keep the most recent (smallest ts-delta from latest).
  const seen = new Set<string>();
  return out.filter((i) => {
    if (seen.has(i.text)) return false;
    seen.add(i.text);
    return true;
  });
}

function humanAgo(ms: number): string {
  if (ms < 60_000) return "just now";
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h ago`;
  return `${Math.round(ms / 86_400_000)}d ago`;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
