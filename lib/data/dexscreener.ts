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
  volume?: { m5?: number; h1?: number; h6?: number; h24?: number };
  priceChange?: { m5?: number; h1?: number; h6?: number; h24?: number };
  txns?: {
    m5?: { buys?: number; sells?: number };
    h1?: { buys?: number; sells?: number };
    h6?: { buys?: number; sells?: number };
    h24?: { buys?: number; sells?: number };
  };
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

// Real-time trending. DexScreener's search endpoint matches on the dexId
// field, so querying DEX names (raydium, meteora, pump, orca) returns the
// actual high-volume pairs on those AMMs. Combine the queries, filter for
// Solana base-tokens trading against SOL/USDC, dedupe per base mint, rank
// by 24h volume.
//
// The previous q=SOL approach returned imposter tokens whose symbol is
// "SOL" (different mints, same string). This DEX-targeted approach gives
// us aura ($27M), RAY ($4M), ZEREBRO ($3M), GIGA ($1.4M), actual movers.

const SOL_MINT = "So11111111111111111111111111111111111111112";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const USDT_MINT = "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB";
const SKIP_BASE_MINTS = new Set([SOL_MINT, USDC_MINT, USDT_MINT]);
// Symbols imposter tokens like to use, exclude these as base tokens.
const SKIP_BASE_SYMBOLS = new Set([
  "SOL", "WSOL", "USDC", "USDT", "USDE", "DAI",
]);
const ACCEPTED_QUOTES = new Set(["SOL", "WSOL", "USDC"]);
const MIN_VOLUME_24H = 50_000; // lowered from 100k so fresh launches with $50-100k 24h vol but heavy 1h activity make the cut

/**
 * Trending score, mirrors what DexScreener's homepage rank does.
 *
 * The previous code sorted by raw 24h volume, which always returns the
 * established large-caps (PUMP, ORCA, FARTCOIN) and never the actually-
 * trending fresh launches (AGIGUY +757%, AGI +1859%, DCB -78%) that have
 * smaller absolute volume but explosive recent activity. Real "trending"
 * is recent + active + moving, not biggest-by-volume.
 *
 * Weights, tuned to match what shows up on dexscreener.com/?rankBy=trendingScoreH6:
 *   - Recent transaction count (h1) gets the most leverage, that's what
 *     "trending right now" actually means.
 *   - 6h transaction count adds context (sustained interest, not a 1-min spike).
 *   - Absolute price move at h1 + h6 captures both pumps and dumps.
 *   - 24h volume kept as a tiebreaker, not the dominant signal.
 *   - Fresh launches (<7d) get a small bonus, established (>30d) a small penalty.
 */
function computeTrendingScore(p: DexPair): number {
  const txnsH1 = (p.txns?.h1?.buys ?? 0) + (p.txns?.h1?.sells ?? 0);
  const txnsH6 = (p.txns?.h6?.buys ?? 0) + (p.txns?.h6?.sells ?? 0);
  const volH24 = p.volume?.h24 ?? 0;
  const chgH1 = Math.abs(p.priceChange?.h1 ?? 0);
  const chgH6 = Math.abs(p.priceChange?.h6 ?? 0);

  // log scale so a 100x txn count doesn't completely dominate.
  const txnComponent = Math.log10(txnsH1 + 1) * 30 + Math.log10(txnsH6 + 1) * 8;
  const volComponent = Math.log10(volH24 + 1) * 6;
  // Cap absurd moves so a 9999% pump doesn't drown out everything else.
  const moveComponent = Math.min(chgH1, 500) * 0.5 + Math.min(chgH6, 500) * 0.15;

  let ageBonus = 0;
  if (p.pairCreatedAt) {
    const ageH = (Date.now() - p.pairCreatedAt) / 3_600_000;
    if (ageH < 24 * 7) ageBonus = 15; // <7d, fresh-launch boost
    else if (ageH < 24 * 30) ageBonus = 5; // 7-30d, mild boost
    else if (ageH > 24 * 365) ageBonus = -8; // >1yr, mild penalty
  }

  return txnComponent + volComponent + moveComponent + ageBonus;
}

const TRENDING_FALLBACK_SEEDS = [
  "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263", // BONK
  "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm", // WIF
  "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN", // JUP
  "jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL", // JTO
  "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R", // RAY
  "MEW1gQWJ3nEXg2qgERiKu7FAFj79PHvQVREQUzScPP5", // MEW
];

/**
 * Symbol/name search. Hits DexScreener's text-search endpoint directly so
 * established tokens (BONK, WIF, JUP, etc.) resolve even though they don't
 * make the trending top-16 by score. Used by /search.
 */
export async function searchBySymbol(query: string): Promise<TrendingToken[]> {
  const q = query.trim().replace(/^\$/, "");
  if (!q) return [];

  const r = await fetch(`${BASE}/latest/dex/search?q=${encodeURIComponent(q)}`, {
    next: { revalidate: 30 },
  })
    .then((res) => (res.ok ? (res.json() as Promise<DexSearchResponse>) : null))
    .catch(() => null);
  if (!r?.pairs) return [];

  const filtered = r.pairs.filter((p) => {
    if (p.chainId !== "solana") return false;
    if (SKIP_BASE_MINTS.has(p.baseToken.address)) return false;
    const baseSym = (p.baseToken.symbol ?? "").toUpperCase();
    if (SKIP_BASE_SYMBOLS.has(baseSym)) return false;
    const quoteSym = (p.quoteToken.symbol ?? "").toUpperCase();
    if (!ACCEPTED_QUOTES.has(quoteSym)) return false;
    // Symbol or name has to actually contain the query, DexScreener's search
    // is permissive and returns adjacent matches we don't want.
    const Q = q.toUpperCase();
    const symMatch = baseSym.includes(Q);
    const nameMatch = (p.baseToken.name ?? "").toUpperCase().includes(Q);
    return symMatch || nameMatch;
  });

  // Dedupe per base token, keep deepest liquidity (the "real" pool).
  const byToken = new Map<string, DexPair>();
  for (const p of filtered) {
    const existing = byToken.get(p.baseToken.address);
    if (!existing || (p.liquidity?.usd ?? 0) > (existing.liquidity?.usd ?? 0)) {
      byToken.set(p.baseToken.address, p);
    }
  }

  // Rank: exact-symbol matches first, then by liquidity.
  const Q = q.toUpperCase();
  return Array.from(byToken.values())
    .sort((a, b) => {
      const aExact = (a.baseToken.symbol ?? "").toUpperCase() === Q ? 1 : 0;
      const bExact = (b.baseToken.symbol ?? "").toUpperCase() === Q ? 1 : 0;
      if (aExact !== bExact) return bExact - aExact;
      return (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0);
    })
    .slice(0, 20)
    .map((p) => mapPairToToken(p));
}

export async function fetchTrending(): Promise<TrendingToken[]> {
  const pairs = await collectSolanaPairs();
  const ranked = pairs
    .slice()
    .sort((a, b) => computeTrendingScore(b) - computeTrendingScore(a));

  // Belt-and-suspenders: if search returned almost nothing, mix in staple seeds.
  if (ranked.length < 6) {
    const fallback = await fetchPairsByMints(TRENDING_FALLBACK_SEEDS);
    const seen = new Set(ranked.map((p) => p.baseToken.address));
    for (const p of fallback) {
      if (!seen.has(p.baseToken.address)) ranked.push(p);
    }
    ranked.sort((a, b) => computeTrendingScore(b) - computeTrendingScore(a));
  }

  return ranked
    .slice(0, LIMITS.TRENDING_RING_COUNT)
    .map<TrendingToken>((p) => mapPairToToken(p));
}

/**
 * Pull Solana pairs from a wide swath of DEX queries + popular search terms,
 * dedupe per base token, filter to real markets. Used by fetchTrending and
 * fetchTrendingFull. Includes pumpfun/pumpswap/letsbonk so fresh launches on
 * those launchpads don't get filtered out.
 */
async function collectSolanaPairs(): Promise<DexPair[]> {
  const collected: DexPair[] = [];
  // Cast a wide net, the actual ranking happens via computeTrendingScore.
  // Solana, sol, and the common quote symbols help surface tokens whose dexId
  // doesn't match a known label (newer launchpads, etc.).
  const queries = [
    "raydium",
    "meteora",
    "pumpfun",
    "pump",
    "pumpswap",
    "orca",
    "letsbonk",
    "solana",
    "sol",
  ];
  const responses = await Promise.all(
    queries.map((q) =>
      fetch(`${BASE}/latest/dex/search?q=${encodeURIComponent(q)}`, {
        next: { revalidate: 60 },
      })
        .then((r) => (r.ok ? (r.json() as Promise<DexSearchResponse>) : null))
        .catch(() => null),
    ),
  );
  for (const json of responses) {
    if (json?.pairs) collected.push(...json.pairs);
  }

  const filtered = collected.filter((p) => {
    if (p.chainId !== "solana") return false;
    if (SKIP_BASE_MINTS.has(p.baseToken.address)) return false;
    const baseSym = (p.baseToken.symbol ?? "").toUpperCase();
    if (SKIP_BASE_SYMBOLS.has(baseSym)) return false;
    const quoteSym = (p.quoteToken.symbol ?? "").toUpperCase();
    if (!ACCEPTED_QUOTES.has(quoteSym)) return false;
    const vol = p.volume?.h24 ?? 0;
    if (vol < MIN_VOLUME_24H) return false;
    return true;
  });

  // Dedupe per base token, keep the pair with the highest trending score so
  // we represent the most-active pool for any token that has multiple pools.
  const byToken = new Map<string, DexPair>();
  for (const p of filtered) {
    const existing = byToken.get(p.baseToken.address);
    if (!existing || computeTrendingScore(p) > computeTrendingScore(existing)) {
      byToken.set(p.baseToken.address, p);
    }
  }

  return Array.from(byToken.values());
}

/** Wider trending fetch for the leaderboard page, same trending-score ranking, more results. */
export async function fetchTrendingFull(limit = 50): Promise<TrendingToken[]> {
  const pairs = await collectSolanaPairs();
  return pairs
    .slice()
    .sort((a, b) => computeTrendingScore(b) - computeTrendingScore(a))
    .slice(0, limit)
    .map((p) => mapPairToToken(p));
}

function mapPairToToken(p: DexPair): TrendingToken {
  const ageMs = p.pairCreatedAt ? Date.now() - p.pairCreatedAt : null;
  return {
    ca: p.baseToken.address,
    symbol: p.baseToken.symbol,
    name: p.baseToken.name,
    image: p.info?.imageUrl ?? null,
    price_usd: parsePriceUsd(p.priceUsd),
    market_cap: p.marketCap ?? null,
    fdv: p.fdv ?? null,
    liquidity_usd: p.liquidity?.usd ?? null,
    price_change_5m: p.priceChange?.m5 ?? null,
    price_change_1h: p.priceChange?.h1 ?? null,
    price_change_6h: p.priceChange?.h6 ?? null,
    price_change_24h: p.priceChange?.h24 ?? null,
    volume_5m: p.volume?.m5 ?? null,
    volume_1h: p.volume?.h1 ?? null,
    volume_6h: p.volume?.h6 ?? null,
    volume_24h: p.volume?.h24 ?? null,
    txns_24h_buys: p.txns?.h24?.buys ?? null,
    txns_24h_sells: p.txns?.h24?.sells ?? null,
    pair_address: p.pairAddress ?? null,
    pair_age_hours: ageMs != null ? ageMs / 3_600_000 : null,
    dex: p.dexId ?? null,
  };
}

/** SOL macro, price + 24h change + 24h volume from the deepest SOL/USDC pair. */
export type SolMacro = {
  price_usd: number | null;
  price_change_24h: number | null;
  volume_24h: number | null;
};

export async function fetchSolMacro(): Promise<SolMacro | null> {
  const pair = await fetchBestSolanaPair(SOL_MINT);
  if (!pair) return null;
  return {
    price_usd: pair.priceUsd ? Number(pair.priceUsd) : null,
    price_change_24h: pair.priceChange?.h24 ?? null,
    volume_24h: pair.volume?.h24 ?? null,
  };
}

async function fetchPairsByMints(mints: string[]): Promise<DexPair[]> {
  if (mints.length === 0) return [];
  const url = `${BASE}/latest/dex/tokens/${mints.join(",")}`;
  const r = await fetch(url, { next: { revalidate: 60 } });
  if (!r.ok) return [];
  const json = (await r.json()) as DexSearchResponse;
  return (json.pairs ?? []).filter((p) => p.chainId === "solana");
}

function parsePriceUsd(s: string | undefined): number | null {
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export type { DexPair };
