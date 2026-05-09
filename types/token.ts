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
  market_cap: number | null;
  fdv: number | null;
  volume_24h: number | null;
  liquidity_usd: number | null;
  lp_locked: boolean | null;
  pair_address: string | null;
  pair_age_hours: number | null;
  dex: string | null;
};

export type TokenHolders = {
  total: number | null;
  top_1_pct: number | null;
  top_10_pct: number | null;
  top_20: Array<{ address: string; amount: number; pct: number }>;
};

export type TweetSnippet = {
  handle: string;
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
  /** Soft-error notes — populated when an upstream API failed but we still rendered. */
  warnings: string[];
};

export type TrendingToken = {
  ca: string;
  symbol: string;
  name: string | null;
  price_usd: number | null;
  price_change_24h: number | null;
  volume_24h: number | null;
  image: string | null;
};

export type WalletReclaimAccount = {
  pubkey: string;
  mint: string;
  symbol: string | null;
  name: string | null;
  rent_lamports: number;
};
