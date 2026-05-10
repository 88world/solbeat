export type TokenMetadata = {
  ca: string;
  name: string | null;
  symbol: string | null;
  decimals: number | null;
  supply: number | null;
  image: string | null;
  description: string | null;
  mint_authority: string | null;
  freeze_authority: string | null;
  is_mutable: boolean | null;
  age_hours: number | null;
};

export type TokenMarket = {
  price_usd: number | null;
  price_change_1h: number | null;
  price_change_24h: number | null;
  price_change_7d: number | null;
  /** 6h / 5m fields, populated when DexScreener returns them. */
  price_change_5m?: number | null;
  price_change_6h?: number | null;
  market_cap: number | null;
  fdv: number | null;
  volume_24h: number | null;
  /** Volume by timeframe, when DexScreener returns it. */
  volume_5m?: number | null;
  volume_1h?: number | null;
  volume_6h?: number | null;
  liquidity_usd: number | null;
  lp_locked: boolean | null;
  pair_address: string | null;
  pair_age_hours: number | null;
  dex: string | null;
  /**
   * Buy/sell transaction counts by timeframe. The first-row degen scan,
   * "are people buying or selling right now?". Volumes are derived
   * (volume_24h * buys / (buys+sells)) since DexScreener exposes counts
   * not dollar amounts. Approximate but actionable.
   */
  txns_5m?: { buys: number; sells: number } | null;
  txns_1h?: { buys: number; sells: number } | null;
  txns_6h?: { buys: number; sells: number } | null;
  txns_24h?: { buys: number; sells: number } | null;
};

export type TokenHolders = {
  total: number | null;
  top_1_pct: number | null;
  top_10_pct: number | null;
  top_20: Array<{
    /** Token-account address (what getTokenLargestAccounts returns). */
    address: string;
    /** OWNER (wallet) address. Same as address for legacy fallback when we couldn't resolve. */
    owner: string;
    amount: number;
    pct: number;
    /**
     * Plain-English classification: "Raydium pool", "CEX · Binance", "Burn 🔥",
     * "Whale", "Sniper · 8h pool", "Holder". Computed in lib/solana/classifier.
     * Stored as a discriminated union under HolderTag.
     */
    tag: { kind: string; label: string };
  }>;
};

export type TweetSnippet = {
  handle: string;
  /** Display name on the X profile (falls back to handle if absent). */
  display_name: string | null;
  /** Profile picture URL, when present we render a real avatar instead of a gradient. */
  avatar_url: string | null;
  /** True if the upstream marks the account as verified. */
  verified: boolean;
  followers: number;
  text: string;
  engagement: number;
  url: string | null;
  age_minutes: number;
};

export type CatalystItem = {
  source: string;
  title: string;
  url: string | null;
  summary: string;
};

export type RiskScore = {
  score: number;
  label: "SAFE" | "LOW" | "MODERATE" | "HIGH" | "EXTREME";
  factors: {
    liquidity: number;
    holders: number;
    authorities: number;
    age: number;
    volume_quality: number;
  };
  top_concern: string;
};

export type TokenSynthesis = {
  what_this_is: string;
  whats_happening: string;
  what_to_know: string;
};

export type TokenAnalysis = {
  ca: string;
  fetched_at: string;
  metadata: TokenMetadata;
  market: TokenMarket;
  holders: TokenHolders;
  tweets: TweetSnippet[];
  catalysts: CatalystItem[];
  risk: RiskScore | null;
  synthesis: TokenSynthesis | null;
  /** Soft-error notes, populated when an upstream API failed but we still rendered. */
  warnings: string[];
};

export type TrendingToken = {
  ca: string;
  symbol: string;
  name: string | null;
  image: string | null;

  // Market
  price_usd: number | null;
  market_cap: number | null;
  fdv: number | null;
  liquidity_usd: number | null;

  // Price change across timeframes
  price_change_5m: number | null;
  price_change_1h: number | null;
  price_change_6h: number | null;
  price_change_24h: number | null;

  // Volume across timeframes
  volume_5m: number | null;
  volume_1h: number | null;
  volume_6h: number | null;
  volume_24h: number | null;

  // Transaction counts (24h)
  txns_24h_buys: number | null;
  txns_24h_sells: number | null;

  // Pair / pool
  pair_address: string | null;
  pair_age_hours: number | null;
  dex: string | null;
};

export type WalletReclaimAccount = {
  pubkey: string;
  mint: string;
  symbol: string | null;
  name: string | null;
  rent_lamports: number;
};
