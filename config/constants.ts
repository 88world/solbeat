// Cache TTLs tiered by how fast each data type actually changes. Set
// post-Upstash wiring — higher TTLs only make sense once we have a
// persistent cross-instance cache (the in-memory fallback resets per
// Vercel instance so longer TTLs just delay the inevitable cold miss).
export const TTL = {
  // Metadata: name, supply, decimals, mint/freeze authorities. Effectively
  // immutable after token deploy — even authority transitions are rare
  // and would surface on next daily refresh.
  TOKEN_METADATA_S: 86_400, // 24h (was 1h)
  // Live spot data. Not actually used by anything; live polls handle this.
  TOKEN_PRICE_S: 30,
  // Holder snapshot. Slow turnover — top-20 list shifts over hours.
  HOLDERS_S: 300, // 5min
  // AI synthesis prose. Mentions "recent" moves; 2h keeps it honest.
  AI_SYNTHESIS_S: 7_200, // 2h (was 10min)
  // Risk score. Derived from on-chain factors that change slowly
  // (liquidity, holder concentration, authorities, age). 6h is fine.
  RISK_SCORE_S: 21_600, // 6h
  // Catalysts. Perplexity reports a 24h window — caching the same answer
  // for 1h still leaves 23h of validity within that window.
  CATALYSTS_S: 3_600, // 1h
  // Recent tweets. Social sentiment can shift in hours; 30min strikes the
  // balance between freshness and burning twitterapi.io credits.
  TWEETS_S: 1_800, // 30min
  // Trending list refresh on homepage (no AI involved, just DexScreener).
  TRENDING_S: 15,
} as const;

export const LIMITS = {
  TWEETS_FOR_SYNTHESIS: 50,
  CATALYSTS_FOR_SYNTHESIS: 6,
  HOLDER_TOP_N: 20,
  TRENDING_RING_COUNT: 16,
  RECLAIM_BATCH_SIZE: 27,
} as const;

export const FEES = {
  RECLAIM_BPS: 500, // 5%, disclosed up-front in UI
  JUPITER_PLATFORM_BPS: 20, // 0.20%
} as const;

// Rent-exempt minimum for an SPL token account (165 bytes). Approximate, but
// stable enough for "expected reclaim total" UI. Actual amount comes from the
// account's lamports field at execution time.
export const APPROX_TOKEN_ACCOUNT_RENT_LAMPORTS = 2_039_280;
export const LAMPORTS_PER_SOL = 1_000_000_000;

export const SOL_MINT = "So11111111111111111111111111111111111111112";
export const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
