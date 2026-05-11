import { NextResponse } from "next/server";
import { isValidSolanaAddress } from "@/lib/solana/validation";
import {
  getTrackedList,
  getLastSignature,
  setLastSignature,
  tryClaimPollCooldown,
  TRACKED_MAX,
} from "@/lib/tracking/storage";
import { getSignaturesForAddress } from "@/lib/data/helius";

export const runtime = "nodejs";

/**
 * Per-owner tracked-wallet polling endpoint.
 *
 * Triggered from the LiveActivityFeed client on a steady cadence. The
 * server enforces a 10-min cooldown per tracked wallet via Upstash — the
 * client can call as often as it wants, we only fire real Helius calls
 * once per 10 min per wallet.
 *
 * Returns FeedEvent-shaped objects ({ kind: "tracked-move", ... }) that
 * the client merges into the existing Live Wire queue.
 *
 * Cost profile per active user with 2 tracked wallets:
 *   - 2 wallets × 6 polls/hour × 24h = 288 Helius getSignaturesForAddress
 *     calls per day (limit: 5 signatures each). Free tier territory.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ owner: string }> },
) {
  const { owner } = await ctx.params;
  if (!isValidSolanaAddress(owner)) {
    return NextResponse.json({ events: [] });
  }

  let tracked: Awaited<ReturnType<typeof getTrackedList>>;
  try {
    tracked = await getTrackedList(owner);
  } catch {
    // Upstash unavailable — feature off, rest of site works.
    return NextResponse.json({ events: [], degraded: true });
  }
  if (tracked.length === 0) {
    return NextResponse.json({ events: [] });
  }

  // For each tracked wallet, check cooldown, fetch sigs if allowed, diff
  // against last-seen, emit events for new signatures. Parallelize across
  // the (max 2) wallets so total wait time is bounded by the slowest call.
  const results = await Promise.all(
    tracked.slice(0, TRACKED_MAX).map(async (entry) => {
      try {
        const claimed = await tryClaimPollCooldown(entry.addr);
        if (!claimed) return [];
        const sigs = await getSignaturesForAddress(entry.addr, { limit: 5 });
        if (sigs.length === 0) return [];
        const lastSeen = await getLastSignature(entry.addr);
        // Newest first from RPC. Anything before lastSeen is "new" relative
        // to our state. On the very first poll (lastSeen null), don't
        // flood — just stamp the latest and emit nothing.
        if (!lastSeen) {
          await setLastSignature(entry.addr, sigs[0].signature);
          return [];
        }
        const fresh: typeof sigs = [];
        for (const s of sigs) {
          if (s.signature === lastSeen) break;
          fresh.push(s);
        }
        if (fresh.length === 0) return [];
        // Update state to newest. Newest event becomes the surface event;
        // multiple-tx bursts collapse to one "X txs in last poll".
        await setLastSignature(entry.addr, fresh[0].signature);
        return [
          {
            kind: "tracked-move" as const,
            label: entry.label,
            addr: entry.addr,
            sig: fresh[0].signature,
            txCount: fresh.length,
            ts: (fresh[0].blockTime ?? Math.floor(Date.now() / 1000)) * 1000,
          },
        ];
      } catch {
        // Helius rate limit / network blip — silently skip, retry next poll.
        return [];
      }
    }),
  );

  const events = results.flat();
  return NextResponse.json({ events });
}
