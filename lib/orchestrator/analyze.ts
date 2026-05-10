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
import { computeSignals, composeVerdict } from "@/lib/pulse/signal";
import { appendPulseSnapshot, composeSnapshot } from "@/lib/pulse/snapshots";

export async function analyzeToken(ca: string): Promise<TokenAnalysis> {
  return cached(`analysis:${ca}`, TTL.AI_SYNTHESIS_S, () => buildAnalysis(ca));
}

/**
 * Two-phase analysis for streaming pages:
 *   analyzeFast  → metadata + market + holders (~1-2s, just RPC + DexScreener)
 *   analyzeSlow  → tweets + catalysts + AI synthesis + AI risk (~5-15s)
 *
 * Critical-path UI (TokenHeader, PriceCard, HolderList, BubbleMap) renders
 * from the fast slice while the slow slice streams in via <Suspense>. Saves
 * the user 10+ seconds of skeleton view on first visit.
 */
export type FastAnalysis = Pick<
  TokenAnalysis,
  "ca" | "fetched_at" | "metadata" | "market" | "holders" | "warnings"
>;
export type SlowAnalysis = Pick<
  TokenAnalysis,
  "tweets" | "catalysts" | "risk" | "synthesis"
>;

export async function analyzeFast(ca: string): Promise<FastAnalysis> {
  return cached(`analysis_fast:${ca}`, TTL.AI_SYNTHESIS_S, () => buildFast(ca));
}

export async function analyzeSlow(
  ca: string,
  fast: FastAnalysis,
): Promise<SlowAnalysis> {
  return cached(`analysis_slow:${ca}`, TTL.AI_SYNTHESIS_S, () =>
    buildSlow(ca, fast),
  );
}

/**
 * Fast slice. RPC + DexScreener only, no AI, no Perplexity, no Twitter. ~1-2s.
 * What the user sees first when the page loads.
 */
async function buildFast(ca: string): Promise<FastAnalysis> {
  const warnings: string[] = [];

  const [asset, dexPair, birdeye, mintInfo] = await Promise.all([
    safe(() => getAsset(ca), "helius_metadata", warnings),
    safe(() => fetchBestSolanaPair(ca), "dexscreener_pair", warnings),
    safe(() => fetchTokenOverview(ca), "birdeye_overview", warnings),
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
    price_change_5m: dexPair?.priceChange?.m5 ?? null,
    price_change_1h: birdeye?.priceChange1h ?? dexPair?.priceChange?.h1 ?? null,
    price_change_6h: dexPair?.priceChange?.h6 ?? null,
    price_change_24h:
      birdeye?.priceChange24h ?? dexPair?.priceChange?.h24 ?? null,
    price_change_7d: birdeye?.priceChange7d ?? null,
    market_cap: birdeye?.marketCap ?? dexPair?.marketCap ?? null,
    fdv: birdeye?.fdv ?? dexPair?.fdv ?? null,
    volume_5m: dexPair?.volume?.m5 ?? null,
    volume_1h: dexPair?.volume?.h1 ?? null,
    volume_6h: dexPair?.volume?.h6 ?? null,
    volume_24h: birdeye?.volume24h ?? dexPair?.volume?.h24 ?? null,
    liquidity_usd: birdeye?.liquidity ?? dexPair?.liquidity?.usd ?? null,
    lp_locked: null,
    pair_address: dexPair?.pairAddress ?? null,
    pair_age_hours: dexPair?.pairCreatedAt
      ? Math.max(0, (Date.now() - dexPair.pairCreatedAt) / 3_600_000)
      : null,
    dex: dexPair?.dexId ?? null,
    txns_5m: dexPair?.txns?.m5
      ? { buys: dexPair.txns.m5.buys ?? 0, sells: dexPair.txns.m5.sells ?? 0 }
      : null,
    txns_1h: dexPair?.txns?.h1
      ? { buys: dexPair.txns.h1.buys ?? 0, sells: dexPair.txns.h1.sells ?? 0 }
      : null,
    txns_6h: dexPair?.txns?.h6
      ? { buys: dexPair.txns.h6.buys ?? 0, sells: dexPair.txns.h6.sells ?? 0 }
      : null,
    txns_24h: dexPair?.txns?.h24
      ? { buys: dexPair.txns.h24.buys ?? 0, sells: dexPair.txns.h24.sells ?? 0 }
      : null,
  };

  const holdersData: TokenHolders = (await safe(
    () => getTokenHolders(ca, metadata.supply, metadata.age_hours),
    "helius_holders",
    warnings,
  )) ?? { total: null, top_1_pct: null, top_10_pct: null, top_20: [] };

  return {
    ca,
    fetched_at: new Date().toISOString(),
    metadata,
    market,
    holders: holdersData,
    warnings,
  };
}

/**
 * Slow slice. Twitter + Perplexity + 2× Claude. ~5-15s. Streams in via
 * <Suspense> after the fast slice has already rendered.
 */
async function buildSlow(ca: string, fast: FastAnalysis): Promise<SlowAnalysis> {
  const warnings = fast.warnings;
  const symbolOrCa = fast.metadata.symbol ?? ca.slice(0, 6);

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
    metadata: fast.metadata,
    market: fast.market,
    holders: fast.holders,
  };

  const [synthesis, risk] = await Promise.all([
    safe(
      () =>
        generateTokenSynthesis({
          metadata: fast.metadata,
          market: fast.market,
          holders: fast.holders,
          tweets: tweets ?? [],
          catalysts: catalysts ?? [],
        }),
      "claude_synthesis",
      warnings,
    ),
    safe(() => generateRiskScore(partial), "claude_risk", warnings),
  ]);

  const finalRisk = risk ?? computeHeuristicRisk(partial);
  const finalTweets = tweets ?? [];
  const finalCatalysts = catalysts ?? [];

  // Snapshot the current pulse for the history timeline. Fire-and-forget,
  // any storage hiccup must not block the UI. Recomputes the SignalPanel
  // verdict from the same compose logic the component uses, so the timeline
  // shows what users actually saw.
  recordPulseSnapshot(ca, fast, finalTweets, finalCatalysts, finalRisk).catch(
    (err) => console.error("[orchestrator] pulse snapshot failed", err),
  );

  return {
    tweets: finalTweets,
    catalysts: finalCatalysts,
    risk: finalRisk,
    synthesis: synthesis ?? null,
  };
}

async function recordPulseSnapshot(
  ca: string,
  fast: FastAnalysis,
  tweets: TweetSnippet[],
  catalysts: CatalystItem[],
  risk: NonNullable<TokenAnalysis["risk"]>,
): Promise<void> {
  const merged: TokenAnalysis = {
    ...fast,
    tweets,
    catalysts,
    risk,
    synthesis: null,
  };
  const signals = computeSignals(merged);
  const verdict = composeVerdict(signals);
  // Take the 3 highest-weight signal labels to render as chips on the timeline.
  const topLabels = [...signals]
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 3)
    .map((s) => s.label);

  await appendPulseSnapshot(
    ca,
    composeSnapshot({
      price_usd: fast.market.price_usd,
      change_24h: fast.market.price_change_24h,
      risk_score: risk.score,
      risk_label: risk.label,
      signal_text: verdict.text,
      signal_severity: verdict.severity,
      signals: topLabels,
    }),
  );
}

async function buildAnalysis(ca: string): Promise<TokenAnalysis> {
  const warnings: string[] = [];

  const [asset, dexPair, birdeye, mintInfo] = await Promise.all([
    safe(() => getAsset(ca), "helius_metadata", warnings),
    safe(() => fetchBestSolanaPair(ca), "dexscreener_pair", warnings),
    safe(() => fetchTokenOverview(ca), "birdeye_overview", warnings),
    // getAccountInfo (jsonParsed), works on public RPC, gives authoritative
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
    price_change_5m: dexPair?.priceChange?.m5 ?? null,
    price_change_1h: birdeye?.priceChange1h ?? dexPair?.priceChange?.h1 ?? null,
    price_change_6h: dexPair?.priceChange?.h6 ?? null,
    price_change_24h:
      birdeye?.priceChange24h ?? dexPair?.priceChange?.h24 ?? null,
    price_change_7d: birdeye?.priceChange7d ?? null,
    market_cap: birdeye?.marketCap ?? dexPair?.marketCap ?? null,
    fdv: birdeye?.fdv ?? dexPair?.fdv ?? null,
    volume_5m: dexPair?.volume?.m5 ?? null,
    volume_1h: dexPair?.volume?.h1 ?? null,
    volume_6h: dexPair?.volume?.h6 ?? null,
    volume_24h: birdeye?.volume24h ?? dexPair?.volume?.h24 ?? null,
    liquidity_usd: birdeye?.liquidity ?? dexPair?.liquidity?.usd ?? null,
    lp_locked: null,
    pair_address: dexPair?.pairAddress ?? null,
    pair_age_hours: dexPair?.pairCreatedAt
      ? Math.max(0, (Date.now() - dexPair.pairCreatedAt) / 3_600_000)
      : null,
    dex: dexPair?.dexId ?? null,
    txns_5m: dexPair?.txns?.m5
      ? { buys: dexPair.txns.m5.buys ?? 0, sells: dexPair.txns.m5.sells ?? 0 }
      : null,
    txns_1h: dexPair?.txns?.h1
      ? { buys: dexPair.txns.h1.buys ?? 0, sells: dexPair.txns.h1.sells ?? 0 }
      : null,
    txns_6h: dexPair?.txns?.h6
      ? { buys: dexPair.txns.h6.buys ?? 0, sells: dexPair.txns.h6.sells ?? 0 }
      : null,
    txns_24h: dexPair?.txns?.h24
      ? { buys: dexPair.txns.h24.buys ?? 0, sells: dexPair.txns.h24.sells ?? 0 }
      : null,
  };

  const holdersData: TokenHolders = await safe(
    () => getTokenHolders(ca, metadata.supply, metadata.age_hours),
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
