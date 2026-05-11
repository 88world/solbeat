/**
 * Cached snapshot of what each curated KOL wallet currently holds. Used
 * by the wallet-intel endpoint to compute "you hold what they hold"
 * overlap — the single most-asked question when degens tail smart money.
 *
 * One full sweep costs 17 wallets × (getTokenAccountsByOwner + a few
 * DexScreener enrichments). Cached 10 min server-side, refreshed lazily
 * on first request after expiry. Each wallet entry is cached independently
 * so a single Helius hiccup doesn't invalidate the whole snapshot.
 */

import { getTokenAccountsByOwner } from "@/lib/data/helius";
import { fetchBestSolanaPair } from "@/lib/data/dexscreener";

export const KOL_WALLETS: Array<{ address: string; name: string }> = [
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

export type KolTopHoldings = {
  /** KOL display name. */
  name: string;
  /** KOL wallet base58. */
  address: string;
  /** Top mints by USD value held, capped at 8. */
  mints: Array<{ mint: string; symbol: string | null; value_usd: number | null }>;
  /** When this entry was last refreshed (ms). */
  ts: number;
};

const TTL_MS = 10 * 60 * 1000;
const cache: Map<string, KolTopHoldings> = new Map();
let sweepInFlight: Promise<KolTopHoldings[]> | null = null;

/**
 * Returns the full set of KOL top-holdings, refreshing any entries older
 * than TTL_MS. Concurrent callers share the same in-flight sweep so we
 * never duplicate work.
 */
export async function getKolHoldings(): Promise<KolTopHoldings[]> {
  // Fast path: everything fresh.
  const now = Date.now();
  const allFresh =
    cache.size === KOL_WALLETS.length &&
    KOL_WALLETS.every((w) => {
      const c = cache.get(w.address);
      return c && now - c.ts < TTL_MS;
    });
  if (allFresh) {
    return KOL_WALLETS.map((w) => cache.get(w.address)!).filter(Boolean);
  }

  // Coalesce parallel callers.
  if (sweepInFlight) return sweepInFlight;
  sweepInFlight = sweep().finally(() => {
    sweepInFlight = null;
  });
  return sweepInFlight;
}

async function sweep(): Promise<KolTopHoldings[]> {
  const results = await Promise.all(
    KOL_WALLETS.map(async (w) => {
      const cached = cache.get(w.address);
      if (cached && Date.now() - cached.ts < TTL_MS) return cached;
      try {
        const accounts = await getTokenAccountsByOwner(w.address);
        const held = accounts
          .filter((a) => (a.account.data.parsed.info.tokenAmount.uiAmount ?? 0) > 0)
          .sort((a, b) => {
            const ba = a.account.data.parsed.info.tokenAmount.uiAmount ?? 0;
            const bb = b.account.data.parsed.info.tokenAmount.uiAmount ?? 0;
            return bb - ba;
          })
          .slice(0, 8);
        // Light enrichment so we have symbols to show. Skip price for
        // KOL holdings — we just need mint + symbol + rough value to
        // compute overlap and explain why we flagged it.
        const enriched = await Promise.all(
          held.map(async (acc) => {
            const mint = acc.account.data.parsed.info.mint;
            const ui = acc.account.data.parsed.info.tokenAmount.uiAmount ?? 0;
            const pair = await fetchBestSolanaPair(mint).catch(() => null);
            const price = pair?.priceUsd ? Number(pair.priceUsd) : null;
            return {
              mint,
              symbol: pair?.baseToken.symbol ?? null,
              value_usd: price ? price * ui : null,
            };
          }),
        );
        const entry: KolTopHoldings = {
          name: w.name,
          address: w.address,
          mints: enriched,
          ts: Date.now(),
        };
        cache.set(w.address, entry);
        return entry;
      } catch {
        // Return stale-cache if we have one, else an empty stub.
        return (
          cached ?? {
            name: w.name,
            address: w.address,
            mints: [],
            ts: Date.now(),
          }
        );
      }
    }),
  );
  return results;
}
