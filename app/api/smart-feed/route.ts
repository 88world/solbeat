import { NextResponse } from "next/server";
import { getSignaturesForAddress } from "@/lib/data/helius";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Smart-money activity feed. Polls the most recent transaction signature
 * for each of the curated KOL wallets and reports which ones have moved
 * within the last lookback window.
 *
 * We DELIBERATELY don't decode the txn (that's an enhanced-transactions
 * call and costs credits). The fact that a known KOL just signed *anything*
 * in the last 90s is itself the signal — the client can append a "view on
 * Solscan" link for users who want the full trace.
 *
 * Cached 30s server-side so multiple tabs and re-renders share the same
 * sweep. 17 wallets × ~1 RPC each = 17 calls per 30s window.
 */

const SMART_MONEY_WALLETS: Array<{ address: string; name: string }> = [
  { address: "Bi4rd5FH5bYEN8scZ7wevxNZyNmKHdaBcvewdPFxYdLt", name: "theo" },
  { address: "6S8GezkxYUfZy9JPtYnanbcZTMB87Wjt1qx3c6ELajKC", name: "Nyhrox" },
  { address: "BtMBMPkoNbnLF9Xn552guQq528KKXcsNBNNBre3oaQtr", name: "Letterbomb" },
  { address: "CyaE1VxvBrahnPWkqm5VsdCvyS2QmNht2UFrKJHga54o", name: "Cented" },
  { address: "4BdKaxN8G6ka4GYtQQWk4G4dZRUTX2vQH9GcXdBREFUk", name: "Jijo" },
  { address: "2fg5QD1eD7rzNNCsvnhmXFm5hqNgwTTG8p7kQ6f3rx6f", name: "Cupsey" },
  { address: "PMJA8UQDyWTFw2Smhyp9jGA6aTaP7jKHR7BPudrgyYN", name: "chester" },
  { address: "86AEJExyjeNNgcp7GrAvCXTDicf5aGWgoERbXFiG1EdD", name: "Publix" },
  { address: "39q2g5tTQn9n7KnuapzwS2smSx3NGYqBoea11tBjsGEt", name: "Walta" },
  { address: "7VBTpiiEjkwRbRGHJFUz6o5fWuhPFtAmy8JGhNqwHNnn", name: "Brox" },
  { address: "4xY9T1Q7foJzJsJ6YZDSsfp9zkzeZsXnxd45SixduMmr", name: "zeropnl" },
  { address: "5t9xBNuDdGTGpjaPTx6hKd7sdRJbvtKS8Mhq6qVbo8Qz", name: "Smokez" },
  { address: "Av3xWHJ5EsoLZag6pr7LKbrGgLRTaykXomDD5kBhL9YQ", name: "Heyitsyolo" },
  { address: "FpD6n8gfoZNxyAN6QqNH4TFQdV9vZEgcv5W4H2YL8k4X", name: "Hesi" },
  { address: "B32QbbdDAyhvUQzjcaM5j6ZVKwjCxAwGH5Xgvb9SJqnC", name: "Kadenox" },
];

type SmartFeedEntry = {
  kol: string;
  address: string;
  last_sig: string;
  /** Unix seconds. */
  last_seen: number;
  /** Seconds ago, computed server-side so the client can render directly. */
  age_seconds: number;
};

let cache: { ts: number; payload: SmartFeedEntry[] } | null = null;
const CACHE_TTL_MS = 30_000;

export async function GET() {
  const now = Date.now();
  if (cache && now - cache.ts < CACHE_TTL_MS) {
    return NextResponse.json(
      { entries: cache.payload, cached: true },
      { headers: { "cache-control": "public, max-age=30" } },
    );
  }

  // 17 parallel RPC pings. Each is `getSignaturesForAddress` with limit:1
  // which is the cheapest way to ask "has this wallet done anything?". A
  // few failures are fine, we just skip those rows.
  const results = await Promise.all(
    SMART_MONEY_WALLETS.map(async ({ address, name }) => {
      try {
        const sigs = await getSignaturesForAddress(address, { limit: 1 });
        if (sigs.length === 0) return null;
        const s = sigs[0];
        if (!s.blockTime) return null;
        // Skip if older than 1 hour — not "live" enough for the feed.
        const age = now / 1000 - s.blockTime;
        if (age > 3600) return null;
        return {
          kol: name,
          address,
          last_sig: s.signature,
          last_seen: s.blockTime,
          age_seconds: Math.floor(age),
        } satisfies SmartFeedEntry;
      } catch {
        return null;
      }
    }),
  );

  const entries = results
    .filter((r): r is SmartFeedEntry => r != null)
    .sort((a, b) => b.last_seen - a.last_seen);

  cache = { ts: now, payload: entries };

  return NextResponse.json(
    { entries, cached: false },
    { headers: { "cache-control": "public, max-age=30" } },
  );
}
