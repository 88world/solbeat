/**
 * Derive a stream of "live activity" events purely from polled data we
 * already fetch — no new backends needed. Each poll cycle compares the
 * current trending + watch snapshot to the previous and emits events for
 * material changes.
 *
 * Why client-side derivation? Hackathon-pace shipping. Smart-money
 * webhooks + pump.fun firehose would be the right long-term answer, but
 * we can get 80% of the perceived "liveness" by diffing what we already
 * poll. Every event surfaces with a verifiable on-chain anchor (CA,
 * mcap, %change) so it's never just decoration.
 */

import type { TrendingToken } from "@/types/token";

export type FeedEvent =
  | {
      kind: "graduation";
      ca: string;
      symbol: string;
      mcap: number | null;
      buyShare: number; // 0..1
      ageHours: number | null;
      ts: number;
    }
  | {
      kind: "rip"; // sharp 5m pump
      ca: string;
      symbol: string;
      mcap: number | null;
      change5m: number; // %
      ts: number;
    }
  | {
      kind: "dump"; // sharp 5m drop
      ca: string;
      symbol: string;
      mcap: number | null;
      change5m: number;
      ts: number;
    }
  | {
      kind: "milestone"; // crossed a mcap round number upward
      ca: string;
      symbol: string;
      mcap: number;
      milestone: number; // the threshold crossed
      ts: number;
    }
  | {
      kind: "sniper"; // <24h token suddenly active
      ca: string;
      symbol: string;
      mcap: number | null;
      ageHours: number | null;
      /** 1h volume in USD — the activity proxy we use because the
       *  trending payload doesn't carry per-1h tx counts. */
      volume1h: number;
      ts: number;
    }
  | {
      kind: "smart-buy"; // a known KOL wallet made a swap (separate fetcher)
      kol: string;
      /** The KOL wallet's base58 address. Threaded through from the
       *  /api/smart-feed endpoint so the click target can resolve to
       *  /wallet/{address} (the public wallet profile page). */
      kol_address: string;
      /** Optional: the token CA we eventually decode. Currently unknown
       *  because we only watch signatures, not parse transaction
       *  contents — wired for the future enhancement. */
      ca?: string;
      ts: number;
    };

const MCAP_MILESTONES = [
  1_000_000, 2_500_000, 5_000_000, 10_000_000, 25_000_000, 50_000_000, 100_000_000,
];

export type SnapshotKey = {
  /** Trending token map by CA → mcap. Used for milestone detection. */
  trendingMcap: Record<string, number | null>;
  /** CAs we've already seen in /api/watch. */
  watchSeen: Set<string>;
  /** CAs we've already fired a rip/dump event for in the last cooldown. */
  ripCooldown: Map<string, number>;
};

export function emptySnapshot(): SnapshotKey {
  return {
    trendingMcap: {},
    watchSeen: new Set(),
    ripCooldown: new Map(),
  };
}

const RIP_THRESHOLD_PCT = 35; // 5m %change to call it a rip
const DUMP_THRESHOLD_PCT = -35;
const RIP_COOLDOWN_MS = 8 * 60 * 1000; // 8 min, don't double-fire on the same token

/**
 * Diff two snapshots + the latest watch/trending payloads. Emits any
 * material events and mutates the snapshot in place with the new state.
 *
 * `nowMs` is parameterized so tests can pin time; in the live client
 * pass Date.now().
 */
export function deriveEvents(
  prev: SnapshotKey,
  next: {
    trending: TrendingToken[];
    watch: TrendingToken[];
  },
  nowMs: number = Date.now(),
): { events: FeedEvent[]; snapshot: SnapshotKey } {
  const events: FeedEvent[] = [];
  const trendingMcapNext: Record<string, number | null> = {};
  const watchSeenNext = new Set(prev.watchSeen);
  const ripCooldownNext = new Map(prev.ripCooldown);

  // --- /api/watch: new tokens that just entered the survival band ---
  for (const w of next.watch) {
    if (!prev.watchSeen.has(w.ca)) {
      // First sighting in the watch list = effectively "just graduated".
      // We only emit when this is actually a new entry, not on initial
      // hydration (the initial Set is empty so we'd flood — but the
      // calling client primes the snapshot on first load).
      const buys = w.txns_24h_buys ?? 0;
      const sells = w.txns_24h_sells ?? 0;
      const total = buys + sells;
      events.push({
        kind: "graduation",
        ca: w.ca,
        symbol: cleanSymbol(w.symbol),
        mcap: w.market_cap ?? w.fdv ?? null,
        buyShare: total > 0 ? buys / total : 0.5,
        ageHours: w.pair_age_hours,
        ts: nowMs,
      });
      watchSeenNext.add(w.ca);
    }
  }

  // --- /api/trending: rips, dumps, milestones, snipers ---
  for (const t of next.trending) {
    const mcap = t.market_cap ?? t.fdv ?? null;
    trendingMcapNext[t.ca] = mcap;

    // Rip / dump — gated by cooldown so a long-running pump doesn't
    // re-fire every poll. 5m change is the noisiest field but also the
    // most "real-time" feeling, which is what the feed wants.
    const change5m = t.price_change_5m ?? 0;
    const lastFired = prev.ripCooldown.get(t.ca) ?? 0;
    const cooledDown = nowMs - lastFired > RIP_COOLDOWN_MS;
    if (cooledDown && change5m >= RIP_THRESHOLD_PCT) {
      events.push({
        kind: "rip",
        ca: t.ca,
        symbol: cleanSymbol(t.symbol),
        mcap,
        change5m,
        ts: nowMs,
      });
      ripCooldownNext.set(t.ca, nowMs);
    } else if (cooledDown && change5m <= DUMP_THRESHOLD_PCT) {
      events.push({
        kind: "dump",
        ca: t.ca,
        symbol: cleanSymbol(t.symbol),
        mcap,
        change5m,
        ts: nowMs,
      });
      ripCooldownNext.set(t.ca, nowMs);
    }

    // Mcap milestone crossings (upward only — the demo wants positivity).
    const prevMcap = prev.trendingMcap[t.ca];
    if (typeof prevMcap === "number" && typeof mcap === "number" && mcap > prevMcap) {
      for (const m of MCAP_MILESTONES) {
        if (prevMcap < m && mcap >= m) {
          events.push({
            kind: "milestone",
            ca: t.ca,
            symbol: cleanSymbol(t.symbol),
            mcap,
            milestone: m,
            ts: nowMs,
          });
          break; // one milestone event per diff, even if we cross two at once
        }
      }
    }

    // Sniper sighting: fresh (<24h) token with surprising 1h volume.
    // TrendingToken doesn't carry per-1h tx counts, so we use volume_1h
    // as the activity intensity proxy — $50K+ in an hour on a sub-day
    // token is real interest, not just a single bot bouncing.
    if (
      typeof t.pair_age_hours === "number" &&
      t.pair_age_hours < 24 &&
      typeof t.volume_1h === "number" &&
      t.volume_1h >= 50_000
    ) {
      if (cooledDown) {
        events.push({
          kind: "sniper",
          ca: t.ca,
          symbol: cleanSymbol(t.symbol),
          mcap,
          ageHours: t.pair_age_hours,
          volume1h: t.volume_1h,
          ts: nowMs,
        });
        ripCooldownNext.set(t.ca, nowMs);
      }
    }
  }

  // Garbage-collect cooldown entries older than 30min so the map
  // doesn't grow forever on a long-running tab.
  for (const [ca, t] of ripCooldownNext) {
    if (nowMs - t > 30 * 60 * 1000) ripCooldownNext.delete(ca);
  }

  return {
    events,
    snapshot: {
      trendingMcap: trendingMcapNext,
      watchSeen: watchSeenNext,
      ripCooldown: ripCooldownNext,
    },
  };
}

function cleanSymbol(s: string | null | undefined): string {
  if (!s) return "—";
  return s.replace(/^\$/, "").toUpperCase();
}

/**
 * Format an event as the one-line ticker copy that lands in the banner.
 * Kept in this file so all the event-shape knowledge stays co-located.
 */
export function formatEvent(ev: FeedEvent): string {
  switch (ev.kind) {
    case "graduation": {
      const mcap = ev.mcap != null ? "$" + humanMcap(ev.mcap) : "fresh";
      const buy = `${Math.round(ev.buyShare * 100)}% buys`;
      return `$${ev.symbol} just graduated · ${mcap} mcap · ${buy} ↑`;
    }
    case "rip":
      return `$${ev.symbol} ripping · +${ev.change5m.toFixed(0)}% in 5m${ev.mcap ? " · $" + humanMcap(ev.mcap) + " mcap" : ""}`;
    case "dump":
      return `$${ev.symbol} dumping · ${ev.change5m.toFixed(0)}% in 5m${ev.mcap ? " · $" + humanMcap(ev.mcap) + " mcap" : ""}`;
    case "milestone":
      return `$${ev.symbol} crossed $${humanMcap(ev.milestone)} mcap`;
    case "sniper":
      return `$${ev.symbol} firing · $${humanMcap(ev.volume1h)} vol in 1h · ${ev.ageHours?.toFixed(0)}h old`;
    case "smart-buy":
      return `Smart money (${ev.kol}) just moved${ev.ca ? "" : ""}`;
  }
}

function humanMcap(n: number): string {
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(2) + "B";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(0) + "K";
  return n.toFixed(0);
}

/** Color hint for the banner accent based on event kind. */
export function eventAccent(ev: FeedEvent): {
  color: string;
  glow: string;
  emoji: string;
  label: string;
} {
  switch (ev.kind) {
    case "graduation":
      return { color: "#5e5cff", glow: "rgba(94, 92, 255, 0.45)", emoji: "🎓", label: "GRAD" };
    case "rip":
      return { color: "#14F195", glow: "rgba(20, 241, 149, 0.45)", emoji: "🚀", label: "RIP" };
    case "dump":
      return { color: "#FF4757", glow: "rgba(255, 71, 87, 0.45)", emoji: "🩸", label: "DUMP" };
    case "milestone":
      return { color: "#FF8B2D", glow: "rgba(255, 139, 45, 0.45)", emoji: "🏁", label: "MCAP" };
    case "sniper":
      return { color: "#FFB938", glow: "rgba(255, 185, 56, 0.45)", emoji: "🎯", label: "SNIPER" };
    case "smart-buy":
      return { color: "#FF2D9C", glow: "rgba(255, 45, 156, 0.45)", emoji: "🧠", label: "SMART" };
  }
}
