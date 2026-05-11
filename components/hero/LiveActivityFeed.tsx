"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import type { TrendingToken } from "@/types/token";
import {
  deriveEvents,
  emptySnapshot,
  eventAccent,
  formatEvent,
  type FeedEvent,
  type SnapshotKey,
} from "@/lib/feed/derive-events";

/**
 * Live Activity Feed banner. Streams a single-line ticker of materially
 * "live" events across the top of the homepage:
 *
 *   - Pump.fun graduations (new entries in /api/watch)
 *   - 5m price rips (≥35%) and dumps (≤−35%)
 *   - Market cap milestone crossings ($1M / $2.5M / $5M / $10M / etc.)
 *   - Fresh-token snipe sightings (<24h old + high 1h txns)
 *   - Smart money moves (any of 17 KOL wallets just signed something)
 *
 * Implementation: pure client. We diff the /api/trending and /api/watch
 * polls poll-over-poll, never re-fetching backends just for this feature.
 * Smart-money entries come from /api/smart-feed which is server-cached.
 *
 * UX: one event visible at a time, rotates every 3.5s. Hover pauses
 * rotation. Click jumps to the underlying token. Accent color + emoji
 * pre-flight encode the event kind so the user reads the *type* before
 * reading the words.
 */
export function LiveActivityFeed({
  trending,
  refreshMs = 15_000,
}: {
  trending: TrendingToken[];
  /** Watch + smart-feed poll cadence. */
  refreshMs?: number;
}) {
  // Rolling event queue. We cap it so memory doesn't unbound, but bigger
  // than the rotation window so the rotation has variety even on quiet
  // markets.
  const [queue, setQueue] = useState<FeedEvent[]>([]);
  const snapshotRef = useRef<SnapshotKey>(emptySnapshot());
  const primedRef = useRef(false);
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);

  // Trending diffing: re-run whenever the trending prop changes (Hero
  // polls it on its own 8s cadence). On the very first observation we
  // PRIME the snapshot without emitting events — otherwise we'd flood
  // the feed with "graduation" events for everything currently in the
  // watch list, on page load.
  const [watch, setWatch] = useState<TrendingToken[]>([]);
  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      // Background-tab gate — skip the watch poll when not visible.
      if (document.hidden) return;
      try {
        const r = await fetch("/api/watch", { cache: "no-store" });
        if (!r.ok) return;
        const json = (await r.json()) as { tokens: TrendingToken[] };
        if (!cancelled) setWatch(json.tokens ?? []);
      } catch {
        /* noop */
      }
    };
    refresh();
    const id = setInterval(refresh, refreshMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [refreshMs]);

  // Smart-money feed: separate poll cadence, slower (45s) because the
  // endpoint is server-cached at 30s and we want to give it time to
  // refresh.
  type SmartEntry = {
    kol: string;
    address: string;
    last_sig: string;
    last_seen: number;
    age_seconds: number;
  };
  const seenSigRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      // Background-tab gate — skip the smart-feed poll when not visible.
      if (document.hidden) return;
      try {
        const r = await fetch("/api/smart-feed", { cache: "no-store" });
        if (!r.ok) return;
        const json = (await r.json()) as { entries: SmartEntry[] };
        if (cancelled) return;
        const newEvents: FeedEvent[] = [];
        for (const e of json.entries ?? []) {
          if (seenSigRef.current.has(e.last_sig)) continue;
          seenSigRef.current.add(e.last_sig);
          newEvents.push({
            kind: "smart-buy",
            kol: e.kol,
            kol_address: e.address,
            ts: e.last_seen * 1000,
          });
        }
        // Don't dump every sighting on initial load — keep at most 1
        // smart-buy in the prime so the user sees the feature exists
        // but doesn't get blasted.
        if (newEvents.length) {
          setQueue((q) => {
            // De-dup by kol+ts in case of overlap; prepend new events.
            const merged = [...newEvents, ...q].slice(0, 60);
            return merged;
          });
        }
      } catch {
        /* noop */
      }
    };
    refresh();
    const id = setInterval(refresh, 45_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  // Diff trending + watch every time either changes.
  useEffect(() => {
    if (trending.length === 0 && watch.length === 0) return;
    if (!primedRef.current) {
      // PRIME pass: build initial snapshot without emitting events. Also
      // synthesize a tiny "welcome" entry so the banner has something to
      // show before the first real event lands.
      primedRef.current = true;
      const { snapshot } = deriveEvents(snapshotRef.current, { trending, watch });
      snapshotRef.current = snapshot;
      // Seed with the top mover so the banner isn't blank on first load.
      const top = [...trending]
        .filter((t) => (t.price_change_5m ?? 0) > 5)
        .sort((a, b) => (b.price_change_5m ?? 0) - (a.price_change_5m ?? 0))[0];
      if (top) {
        setQueue([
          {
            kind: "rip",
            ca: top.ca,
            symbol: (top.symbol ?? "—").replace(/^\$/, "").toUpperCase(),
            mcap: top.market_cap ?? top.fdv ?? null,
            change5m: top.price_change_5m ?? 0,
            ts: Date.now(),
          },
        ]);
      }
      return;
    }
    const { events, snapshot } = deriveEvents(snapshotRef.current, { trending, watch });
    snapshotRef.current = snapshot;
    if (events.length === 0) return;
    setQueue((q) => {
      // Newest at the front so the rotation lands on fresh events first
      // after we increment idx.
      const merged = [...events, ...q].slice(0, 60);
      return merged;
    });
    // Reset rotation so the user immediately sees the freshest event.
    setIdx(0);
  }, [trending, watch]);

  // Rotation. Skipped while paused or queue is empty.
  useEffect(() => {
    if (paused || queue.length <= 1) return;
    const id = setInterval(() => {
      setIdx((i) => (i + 1) % queue.length);
    }, 3500);
    return () => clearInterval(id);
  }, [paused, queue.length]);

  const current = queue[idx] ?? null;

  // Hide the feed entirely when there's literally nothing — but show a
  // skeleton during the first ~3s while we're priming so the banner
  // doesn't pop in jarringly.
  const showPlaceholder = current == null;

  return (
    <div
      className="relative w-full rounded-full overflow-hidden flex items-center gap-3 px-3 sm:px-4 py-2.5 min-h-[44px]"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      style={{
        background:
          "linear-gradient(90deg, var(--glass-strong) 0%, var(--glass-medium) 50%, var(--glass-strong) 100%)",
        border: "1px solid var(--border-subtle)",
        boxShadow:
          "0 1px 0 rgba(255,255,255,0.08) inset, 0 6px 18px rgba(10, 10, 30, 0.05)",
      }}
    >
      {/* Left: pip + label. Real flex item now (not absolutely positioned)
          so the event content can never overlap it. Wordmark hides on
          phones — the pip alone carries the meaning. The "paused" suffix
          is a separate inline-flex item so it has its own width budget
          and doesn't blow out the label. */}
      <div className="flex items-center gap-2 shrink-0">
        <span className="relative flex">
          <span
            className="absolute inset-0 size-2 rounded-full animate-ping"
            style={{ background: "#FF2D9C", opacity: 0.6 }}
          />
          <span
            className="relative size-2 rounded-full"
            style={{ background: "#FF2D9C" }}
          />
        </span>
        <span className="hidden sm:inline text-[9.5px] uppercase tracking-[0.22em] font-bold text-text-secondary whitespace-nowrap">
          Live wire
        </span>
        {paused && (
          <span className="hidden sm:inline text-[9.5px] uppercase tracking-[0.22em] font-bold text-text-muted whitespace-nowrap">
            · paused
          </span>
        )}
        {/* Vertical divider between header and event content. Subtle,
            keeps the two regions visually distinct without a hard line. */}
        <span
          aria-hidden
          className="hidden sm:inline-block h-4 w-px ml-1"
          style={{ background: "var(--border-subtle)" }}
        />
      </div>

      {/* Center: event content, fills remaining width, content can
          truncate inside FeedRow if the line gets long. */}
      <div className="flex-1 min-w-0">
        <AnimatePresence mode="wait">
          {showPlaceholder ? (
            <motion.div
              key="placeholder"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-[12px] text-text-muted"
            >
              Listening to the chain…
            </motion.div>
          ) : (
            <FeedRow key={current!.ts + current!.kind} ev={current!} />
          )}
        </AnimatePresence>
      </div>

      {/* Right: counter, desktop-only. Stays out of the flex flow on
          phones so the event line has full breathing room. */}
      <span className="hidden sm:inline text-[9.5px] uppercase tracking-[0.18em] font-bold text-text-muted tabular-nums shrink-0">
        {queue.length > 0 ? `${idx + 1} / ${queue.length}` : "—"}
      </span>
    </div>
  );
}

function FeedRow({ ev }: { ev: FeedEvent }) {
  const accent = eventAccent(ev);
  const text = formatEvent(ev);

  // Resolve the click target per event kind:
  //   smart-buy → /wallet/{kol_address} (the KOL's public wallet profile)
  //   anything else with a `ca` → /token/{ca}
  //   nothing else qualifies for a link
  let href: string | null = null;
  if (ev.kind === "smart-buy" && ev.kol_address) {
    href = `/wallet/${ev.kol_address}`;
  } else if (ev.kind !== "smart-buy") {
    const ca = (ev as { ca?: string }).ca;
    if (ca) href = `/token/${ca}`;
  }

  const Inner = (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="flex items-center gap-3 min-w-0 w-full"
    >
      <span
        className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[9.5px] font-bold uppercase tracking-[0.14em] shrink-0"
        style={{
          background: `${accent.color}1A`,
          color: accent.color,
          boxShadow: `inset 0 0 0 1px ${accent.color}55, 0 0 12px ${accent.glow}`,
        }}
      >
        <span aria-hidden>{accent.emoji}</span>
        {accent.label}
      </span>
      <span className="text-[13px] text-text-primary font-semibold tracking-tight truncate">
        {text}
      </span>
      {/* Trailing arrow hints "tap to go". Only on linkable events. */}
      {href && (
        <span
          aria-hidden
          className="ml-auto pl-2 text-[12px] text-text-muted shrink-0 hidden sm:inline-flex"
          style={{ color: accent.color, opacity: 0.7 }}
        >
          →
        </span>
      )}
    </motion.div>
  );

  // Link wraps the motion.div with `pointer-events-none` on the inner —
  // that way all clicks register on the <a> regardless of which framer-
  // motion transition state the inner element is in (otherwise mid-exit
  // animation can swallow pointer events). `prefetch={false}` prevents
  // every rotation tick from prefetching the next event's target, which
  // was firing /api/trending for every CA every 3.5s.
  if (href) {
    return (
      <Link
        href={href}
        prefetch={false}
        className="group block w-full cursor-pointer hover:opacity-95 transition-opacity"
      >
        {Inner}
      </Link>
    );
  }
  return Inner;
}
