export const TTL = {
  TOKEN_METADATA_S: 3600,
  TOKEN_PRICE_S: 30,
  HOLDERS_S: 300,
  AI_SYNTHESIS_S: 600,
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
