/**
 * Composite data fetcher for the /wallet/[address] profile page.
 *
 * Pulls from on-chain (Helius RPC) + market data (DexScreener) + the
 * smart-money classifier to build a public-facing wallet profile. Designed
 * so the FAST slice (identity + balance + age) returns in <1s and the
 * SLOW slice (holdings, activity histogram) streams in behind a Suspense
 * boundary. The page never blocks on the heavy stuff.
 */

import {
  getAccountKind,
  lamportsToSol,
  getTokenAccountsByOwner,
  getRecentSignatures,
  type SignatureRow,
  type AccountKind,
} from "@/lib/data/helius";
import { fetchBestSolanaPair } from "@/lib/data/dexscreener";
import { smartMoneyName } from "@/lib/solana/classifier";

export type WalletBadge =
  | { kind: "smart"; label: string }
  | { kind: "whale"; label: string }
  | { kind: "fresh"; label: string }
  | { kind: "veteran"; label: string }
  | { kind: "dormant"; label: string }
  | { kind: "active"; label: string };

/** Wallet identity surface — what shows on the hero, derived from cheap data. */
export type WalletIdentity = {
  address: string;
  /** Short label if we can name this wallet ("Smart · theo", "Whale", etc.). */
  alias: string | null;
  /** All badges we managed to assign. */
  badges: WalletBadge[];
  /** Current SOL balance (native, not staked). */
  sol_balance: number;
  /** Lamports — useful for exact rendering. */
  lamports: number;
  /** Wallet age in days from first observed transaction (null if unknown). */
  age_days: number | null;
  /** Unix seconds of the most recent transaction (null if unknown). */
  last_seen: number | null;
  /** Approximate composite "whale score" 0..100 based on SOL balance. */
  whale_score: number;
};

export type WalletHolding = {
  mint: string;
  symbol: string | null;
  name: string | null;
  image: string | null;
  /** UI balance (decimal-adjusted). */
  balance: number;
  /** Spot price in USD. */
  price_usd: number | null;
  /** Position USD value. */
  value_usd: number | null;
  /** 24h % change on the token. */
  price_change_24h: number | null;
};

export type WalletActivity = {
  /** Bucketed transaction count per day (oldest → newest). */
  days: { date: string; count: number }[];
  /** Total signatures we scanned. */
  total_signatures: number;
  /** Most recent N raw rows (for the activity stream cell). */
  recent: SignatureRow[];
};

export type WalletProfile = {
  identity: WalletIdentity;
  /** Set when the on-chain account isn't a wallet (e.g., user pasted a mint). */
  not_a_wallet: AccountKind | null;
};

/** ---------- Tier 1: FAST identity (<1s) ----------------------------- */

/**
 * Builds the identity slice that lands above the fold on the wallet page.
 * Cheapest possible: one getAccountInfo for type + lamports, then one
 * getSignaturesForAddress (limit 1) just for the most recent timestamp.
 * Age is computed lazily by Tier 2 — we can show "active" / "dormant"
 * from the most-recent timestamp alone.
 */
export async function fetchWalletIdentity(
  address: string,
): Promise<WalletProfile> {
  // Type + lamports. If it's not a wallet, the caller (page) decides what to do.
  const kindInfo = await getAccountKind(address);
  if (kindInfo.kind !== "wallet" && kindInfo.kind !== "unknown") {
    return {
      identity: emptyIdentity(address),
      not_a_wallet: kindInfo.kind,
    };
  }

  const sol = lamportsToSol(kindInfo.lamports);

  // Single signature for "last seen" — keeps this slice cheap.
  const recent = await getRecentSignatures(address, 1); // max 1000 in 1 page
  const last_seen =
    recent.length > 0
      ? Math.max(...recent.map((r) => r.blockTime ?? 0)) || null
      : null;

  // We only need the OLDEST timestamp inside the first 1000 sigs to estimate
  // age. For very active wallets this still won't reach genesis, but it's
  // the right ballpark and the heatmap (Tier 2) will fill in finer history.
  const oldest =
    recent.length > 0
      ? Math.min(
          ...recent
            .map((r) => r.blockTime ?? Infinity)
            .filter((t) => Number.isFinite(t)),
        )
      : null;
  const age_days =
    oldest != null && Number.isFinite(oldest)
      ? Math.max(0, Math.floor((Date.now() / 1000 - oldest) / 86400))
      : null;

  const badges: WalletBadge[] = [];
  const smart = smartMoneyName(address);
  if (smart) badges.push({ kind: "smart", label: `Smart · ${smart}` });

  // Whale tier: ≥500 SOL is the kind of wallet a degen watches.
  if (sol >= 500) badges.push({ kind: "whale", label: "Whale" });
  else if (sol >= 100) badges.push({ kind: "active", label: "Active" });

  // Tenure: <7 days = fresh, >365 days = veteran.
  if (age_days != null) {
    if (age_days < 7) badges.push({ kind: "fresh", label: "Fresh" });
    else if (age_days > 365) badges.push({ kind: "veteran", label: "Veteran" });
  }

  // Dormancy: nothing in 30 days while having a balance.
  if (last_seen != null) {
    const idleDays = (Date.now() / 1000 - last_seen) / 86400;
    if (idleDays > 30 && sol > 0)
      badges.push({ kind: "dormant", label: "Dormant" });
  }

  // Whale score: log-scale 0..100 anchored at 5000 SOL = 100.
  const whale_score =
    sol <= 0
      ? 0
      : Math.max(0, Math.min(100, Math.round((Math.log10(sol + 1) / Math.log10(5001)) * 100)));

  return {
    identity: {
      address,
      alias: smart ?? null,
      badges,
      sol_balance: sol,
      lamports: kindInfo.lamports,
      age_days,
      last_seen,
      whale_score,
    },
    not_a_wallet: null,
  };
}

function emptyIdentity(address: string): WalletIdentity {
  return {
    address,
    alias: null,
    badges: [],
    sol_balance: 0,
    lamports: 0,
    age_days: null,
    last_seen: null,
    whale_score: 0,
  };
}

/** ---------- Tier 2: SLOW holdings (suspense'd) ---------------------- */

/**
 * Fetches all SPL holdings, enriches up to N with DexScreener data for
 * price/symbol/image. Capped because each enrichment is its own HTTP
 * round trip; we sort by raw balance first and only enrich the top.
 */
export async function fetchWalletHoldings(
  address: string,
  enrichLimit = 18,
): Promise<WalletHolding[]> {
  const accounts = await getTokenAccountsByOwner(address);
  const held = accounts.filter((a) => {
    const ui = a.account.data.parsed.info.tokenAmount.uiAmount;
    return ui != null && ui > 0;
  });

  // Sort by balance descending so we enrich the largest positions first
  // (those drive the donut + USD totals).
  held.sort((a, b) => {
    const ba = a.account.data.parsed.info.tokenAmount.uiAmount ?? 0;
    const bb = b.account.data.parsed.info.tokenAmount.uiAmount ?? 0;
    return bb - ba;
  });

  const enriched = await Promise.all(
    held.slice(0, enrichLimit).map(async (acc) => {
      const mint = acc.account.data.parsed.info.mint;
      const ui = acc.account.data.parsed.info.tokenAmount.uiAmount ?? 0;
      const pair = await fetchBestSolanaPair(mint).catch(() => null);
      const price = pair?.priceUsd ? Number(pair.priceUsd) : null;
      const holding: WalletHolding = {
        mint,
        symbol: pair?.baseToken.symbol ?? null,
        name: pair?.baseToken.name ?? null,
        image: pair?.info?.imageUrl ?? null,
        balance: ui,
        price_usd: price,
        value_usd: price ? price * ui : null,
        price_change_24h: pair?.priceChange?.h24 ?? null,
      };
      return holding;
    }),
  );

  // Sort by USD value descending — tail w/o price falls to the bottom.
  return enriched.sort(
    (a, b) => (b.value_usd ?? 0) - (a.value_usd ?? 0),
  );
}

/** ---------- Tier 2: SLOW activity (suspense'd) ---------------------- */

/**
 * Pulls up to ~3000 signatures and bins them into UTC-day buckets so the
 * heatmap reads "this wallet was active on these days, silent on those".
 * We don't decode the txns themselves (that's expensive); the count is
 * what the heatmap needs.
 */
export async function fetchWalletActivity(
  address: string,
): Promise<WalletActivity> {
  const sigs = await getRecentSignatures(address, 3);
  const bucket = new Map<string, number>();
  for (const s of sigs) {
    if (!s.blockTime) continue;
    const d = new Date(s.blockTime * 1000);
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
    bucket.set(key, (bucket.get(key) ?? 0) + 1);
  }
  const days = Array.from(bucket.entries())
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  return {
    days,
    total_signatures: sigs.length,
    // newest-first slice for the activity stream
    recent: [...sigs].reverse().slice(0, 24),
  };
}
