import type {
  TokenAnalysis,
  TokenMetadata,
  TokenMarket,
  TokenHolders,
  TweetSnippet,
  CatalystItem,
} from "@/types/token";
import { cached } from "@/lib/cache/redis";
import { TTL } from "@/config/constants";
import { fetchBestSolanaPair } from "@/lib/data/dexscreener";
import { getAsset, getMintAccount, getTokenHolders } from "@/lib/data/helius";
import { fetchTokenOverview } from "@/lib/data/birdeye";
import { fetchCatalysts } from "@/lib/data/perplexity";
import { fetchRecentTweets } from "@/lib/data/twitter";
import { generateTokenSynthesis } from "@/lib/ai/prompts/token_analysis";
import {
  computeHeuristicRisk,
  generateRiskScore,
} from "@/lib/ai/prompts/risk_assessment";

export async function analyzeToken(ca: string): Promise<TokenAnalysis> {
  return cached(`analysis:${ca}`, TTL.AI_SYNTHESIS_S, () => buildAnalysis(ca));
}

async function buildAnalysis(ca: string): Promise<TokenAnalysis> {
  const warnings: string[] = [];

  const [asset, dexPair, birdeye, mintInfo] = await Promise.all([
    safe(() => getAsset(ca), "helius_metadata", warnings),
    safe(() => fetchBestSolanaPair(ca), "dexscreener_pair", warnings),
    safe(() => fetchTokenOverview(ca), "birdeye_overview", warnings),
    // getAccountInfo (jsonParsed) — works on public RPC, gives authoritative
    // on-chain supply, decimals, mint authority, freeze authority. The cheap
    // path for the data DAS/Helius normally provides.
    safe(() => getMintAccount(ca), "mint_account", warnings),
  ]);

  const metadata: TokenMetadata = {
    ca,
    name: asset?.name ?? dexPair?.baseToken.name ?? null,
    symbol: asset?.symbol ?? dexPair?.baseToken.symbol ?? null,
    decimals: asset?.decimals ?? mintInfo?.decimals ?? null,
    supply: asset?.supply ?? mintInfo?.supply ?? null,
    image: asset?.image ?? dexPair?.info?.imageUrl ?? null,
    description: asset?.description ?? null,
    mint_authority: asset?.mint_authority ?? mintInfo?.mintAuthority ?? null,
    freeze_authority: asset?.freeze_authority ?? mintInfo?.freezeAuthority ?? null,
    is_mutable: asset?.is_mutable ?? null,
    age_hours: dexPair?.pairCreatedAt
      ? Math.max(0, (Date.now() - dexPair.pairCreatedAt) / 3_600_000)
      : null,
  };

  const market: TokenMarket = {
    price_usd:
      birdeye?.price ?? (dexPair?.priceUsd ? Number(dexPair.priceUsd) : null),
    price_change_1h: birdeye?.priceChange1h ?? dexPair?.priceChange?.h1 ?? null,
    price_change_24h:
      birdeye?.priceChange24h ?? dexPair?.priceChange?.h24 ?? null,
    price_change_7d: birdeye?.priceChange7d ?? null,
    market_cap: birdeye?.marketCap ?? dexPair?.marketCap ?? null,
    fdv: birdeye?.fdv ?? dexPair?.fdv ?? null,
    volume_24h: birdeye?.volume24h ?? dexPair?.volume?.h24 ?? null,
    liquidity_usd: birdeye?.liquidity ?? dexPair?.liquidity?.usd ?? null,
    lp_locked: null,
    pair_address: dexPair?.pairAddress ?? null,
    pair_age_hours: dexPair?.pairCreatedAt
      ? Math.max(0, (Date.now() - dexPair.pairCreatedAt) / 3_600_000)
      : null,
    dex: dexPair?.dexId ?? null,
  };

  const holdersData: TokenHolders = await safe(
    () => getTokenHolders(ca, metadata.supply),
    "helius_holders",
    warnings,
  ) ?? { total: null, top_1_pct: null, top_10_pct: null, top_20: [] };

  const symbolOrCa = metadata.symbol ?? ca.slice(0, 6);
  const [tweets, catalysts] = await Promise.all([
    safe<TweetSnippet[]>(
      () => fetchRecentTweets(symbolOrCa, ca),
      "twitter_recent",
      warnings,
    ),
    safe<CatalystItem[]>(
      () => fetchCatalysts(symbolOrCa, ca),
      "perplexity_catalysts",
      warnings,
    ),
  ]);

  const partial = {
    metadata,
    market,
    holders: holdersData,
  };

  const [synthesis, risk] = await Promise.all([
    safe(
      () =>
        generateTokenSynthesis({
          metadata,
          market,
          holders: holdersData,
          tweets: tweets ?? [],
          catalysts: catalysts ?? [],
        }),
      "claude_synthesis",
      warnings,
    ),
    safe(() => generateRiskScore(partial), "claude_risk", warnings),
  ]);

  return {
    ca,
    fetched_at: new Date().toISOString(),
    metadata,
    market,
    holders: holdersData,
    tweets: tweets ?? [],
    catalysts: catalysts ?? [],
    risk: risk ?? computeHeuristicRisk(partial),
    synthesis: synthesis ?? null,
    warnings,
  };
}

async function safe<T>(
  fn: () => Promise<T | null>,
  label: string,
  warnings: string[],
): Promise<T | null> {
  try {
    return await fn();
  } catch (err) {
    warnings.push(`${label}_failed`);
    console.error(`[orchestrator] ${label} failed`, err);
    return null;
  }
}
