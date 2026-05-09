import type { TrendingToken } from "@/types/token";
import { LIMITS } from "@/config/constants";

const BASE = "https://api.dexscreener.com";

type DexPair = {
  chainId: string;
  dexId: string;
  url: string;
  pairAddress: string;
  baseToken: { address: string; name: string; symbol: string };
  quoteToken: { address: string; name: string; symbol: string };
  priceNative: string;
  priceUsd: string;
  volume?: { h24?: number; h6?: number; h1?: number };
  priceChange?: { h24?: number; h6?: number; h1?: number };
  liquidity?: { usd?: number };
  fdv?: number;
  marketCap?: number;
  pairCreatedAt?: number;
  info?: { imageUrl?: string };
};

type DexSearchResponse = { pairs: DexPair[] | null };

export async function fetchPairsByMint(mint: string): Promise<DexPair[]> {
  const r = await fetch(`${BASE}/latest/dex/tokens/${mint}`, {
    next: { revalidate: 30 },
  });
  if (!r.ok) return [];
  const json = (await r.json()) as DexSearchResponse;
  return (json.pairs ?? []).filter((p) => p.chainId === "solana");
}

/** Choose the deepest Solana pair by USD liquidity. */
export async function fetchBestSolanaPair(mint: string): Promise<DexPair | null> {
  const pairs = await fetchPairsByMint(mint);
  if (pairs.length === 0) return null;
  return pairs
    .slice()
    .sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0];
}

// Solana liquid + memecoin staples. We resolve their live market data each
// time. This is a curated list rather than a "trending" feed because
// DexScreener's search endpoint returns name-collision noise (imposter SOLs)
// when queried broadly, and the hero ring should always show recognizable
// tickers.
const TRENDING_SEEDS = [
  "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263", // BONK
  "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm", // WIF
  "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN", // JUP
  "jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL", // JTO
  "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R", // RAY
  "MEW1gQWJ3nEXg2qgERiKu7FAFj79PHvQVREQUzScPP5", // MEW
  "2qEHjDLDLbuBgRYvsxhc5D6uDWAivNFZGan56P1tpump", // PNUT
  "7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr", // POPCAT
  "5z3EqYQo9HiCEs3R84RCDMu2n7anpDMxRhdK8PSWmrRC", // PONKE
  "HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3", // PYTH
  "rndrizKT3MK1iimdxRdWabcF7Zg7AR5T4nud4EkHBof", // RENDER
  "27G8MtK7VtTcCHkpASjSDdkWWYfoqT6ggEuKidVJidD4", // JLP
  "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", // USDT
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // USDC
];

export async function fetchTrending(): Promise<TrendingToken[]> {
  // DexScreener accepts up to 30 token addresses comma-separated.
  const url = `${BASE}/latest/dex/tokens/${TRENDING_SEEDS.join(",")}`;
  const r = await fetch(url, { next: { revalidate: 60 } });
  if (!r.ok) return [];
  const json = (await r.json()) as DexSearchResponse;
  const all = (json.pairs ?? []).filter((p) => p.chainId === "solana");

  // Pick the deepest pair per base token.
  const byToken = new Map<string, DexPair>();
  for (const p of all) {
    const existing = byToken.get(p.baseToken.address);
    if (!existing || (p.liquidity?.usd ?? 0) > (existing.liquidity?.usd ?? 0)) {
      byToken.set(p.baseToken.address, p);
    }
  }

  const tokens = Array.from(byToken.values())
    .sort((a, b) => (b.volume?.h24 ?? 0) - (a.volume?.h24 ?? 0))
    .slice(0, LIMITS.TRENDING_RING_COUNT)
    .map<TrendingToken>((p) => ({
      ca: p.baseToken.address,
      symbol: p.baseToken.symbol,
      name: p.baseToken.name,
      price_usd: parsePriceUsd(p.priceUsd),
      price_change_24h: p.priceChange?.h24 ?? null,
      volume_24h: p.volume?.h24 ?? null,
      image: p.info?.imageUrl ?? null,
    }));

  return tokens;
}

function parsePriceUsd(s: string | undefined): number | null {
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export type { DexPair };
