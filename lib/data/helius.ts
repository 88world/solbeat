import type { TokenHolders, TokenMetadata } from "@/types/token";
import { LIMITS, TTL } from "@/config/constants";
import { classifyOwner } from "@/lib/solana/classifier";
import { cached } from "@/lib/cache/redis";

const HELIUS_KEY = process.env.HELIUS_API_KEY;
const HELIUS_RPC = HELIUS_KEY
  ? `https://mainnet.helius-rpc.com/?api-key=${HELIUS_KEY}`
  : "https://api.mainnet-beta.solana.com";

type RpcResponse<T> = {
  jsonrpc: "2.0";
  id: string;
  result?: T;
  error?: { code: number; message: string };
};

async function rpc<T>(method: string, params: unknown): Promise<T | null> {
  try {
    const r = await fetch(HELIUS_RPC, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: "solbeat", method, params }),
      next: { revalidate: 0 },
    });
    if (!r.ok) return null;
    const json = (await r.json()) as RpcResponse<T>;
    return json.result ?? null;
  } catch {
    return null;
  }
}

type DasAsset = {
  id: string;
  content?: {
    metadata?: { name?: string; symbol?: string; description?: string };
    files?: Array<{ uri?: string; cdn_uri?: string; mime?: string }>;
    links?: { image?: string };
  };
  token_info?: {
    decimals?: number;
    supply?: string | number;
    symbol?: string;
    token_program?: string;
    price_info?: { price_per_token?: number };
  };
  mutable?: boolean;
  authorities?: Array<{ address: string; scopes: string[] }>;
  ownership?: { owner?: string };
};

type ParsedMintInfo = {
  decimals: number;
  freezeAuthority: string | null;
  isInitialized: boolean;
  mintAuthority: string | null;
  supply: string;
};

type ParsedAccountResp = {
  value: {
    data: {
      parsed?: { type: string; info: ParsedMintInfo };
      program?: string;
    };
    owner?: string;
    lamports?: number;
  } | null;
};

/**
 * Reads authoritative on-chain mint state via getAccountInfo with the
 * jsonParsed encoding. Works on the *public* Solana RPC, no API key needed —
 * and is the cheapest way to surface supply, decimals, mint authority, and
 * freeze authority for any SPL token.
 */
export async function getMintAccount(mint: string): Promise<{
  supply: number;
  decimals: number;
  mintAuthority: string | null;
  freezeAuthority: string | null;
} | null> {
  const result = await rpc<ParsedAccountResp>(
    "getAccountInfo",
    [mint, { encoding: "jsonParsed" }],
  );
  const parsed = result?.value?.data?.parsed;
  if (!parsed || parsed.type !== "mint") return null;
  const info = parsed.info;
  if (!info || typeof info.decimals !== "number") return null;
  // Supply comes back as a base-units string; divide by 10^decimals for UI amount.
  let supply: number;
  try {
    supply = Number(BigInt(info.supply)) / Math.pow(10, info.decimals);
  } catch {
    return null;
  }
  return {
    supply,
    decimals: info.decimals,
    mintAuthority: info.mintAuthority ?? null,
    freezeAuthority: info.freezeAuthority ?? null,
  };
}

/**
 * Cached by mint at TTL.TOKEN_METADATA_S (24h). Token metadata —
 * name, supply, decimals, authorities, image — is effectively
 * immutable after deploy. Authority transitions are rare events the
 * next daily refresh will catch. Caching for 24h saves Helius DAS
 * credits on every repeat visit to an established token.
 */
export async function getAsset(mint: string): Promise<TokenMetadata | null> {
  return cached(`metadata:${mint}`, TTL.TOKEN_METADATA_S, () =>
    getAssetUncached(mint),
  );
}

async function getAssetUncached(mint: string): Promise<TokenMetadata | null> {
  const result = await rpc<DasAsset>("getAsset", { id: mint });
  if (!result) return null;

  const meta = result.content?.metadata;
  const ti = result.token_info;
  const image =
    result.content?.links?.image ??
    result.content?.files?.find((f) => f.mime?.startsWith("image"))?.cdn_uri ??
    result.content?.files?.[0]?.uri ??
    null;

  // Helius DAS does not always report mint authority cleanly; we infer.
  const mintAuth =
    result.authorities?.find((a) => a.scopes.includes("full"))?.address ?? null;

  const supply =
    ti?.supply != null
      ? Number(ti.supply) / Math.pow(10, ti.decimals ?? 0)
      : null;

  return {
    ca: mint,
    name: meta?.name ?? ti?.symbol ?? null,
    symbol: meta?.symbol ?? ti?.symbol ?? null,
    decimals: ti?.decimals ?? null,
    supply,
    image,
    description: meta?.description ?? null,
    mint_authority: mintAuth,
    freeze_authority: null,
    is_mutable: result.mutable ?? null,
    age_hours: null,
  };
}

type LargestAccount = { address: string; amount: string; uiAmount: number; decimals: number };

type ParsedTokenAccount = {
  data: {
    parsed?: {
      info?: {
        owner?: string;
        mint?: string;
        tokenAmount?: { uiAmount?: number; amount?: string };
      };
    };
  } | null;
  lamports?: number;
  owner?: string;
};

export async function getTokenHolders(
  mint: string,
  totalSupply: number | null,
  /** Token / pool age in hours, used for sniper detection. */
  ageHours: number | null = null,
): Promise<TokenHolders> {
  const result = await rpc<{ value: LargestAccount[] }>(
    "getTokenLargestAccounts",
    [mint, { commitment: "confirmed" }],
  );

  const accounts = result?.value ?? [];
  if (accounts.length === 0 || !totalSupply || totalSupply <= 0) {
    return { total: null, top_1_pct: null, top_10_pct: null, top_20: [] };
  }

  const slice = accounts.slice(0, LIMITS.HOLDER_TOP_N);

  // Resolve OWNER addresses for each token-account address. One RPC call
  // batched via getMultipleAccounts. Without this we'd be classifying token
  // accounts (every one of them owned by the SPL Token program), which
  // tells us nothing.
  const ownerMap = new Map<string, string>();
  const owners = await rpc<{ value: Array<ParsedTokenAccount | null> }>(
    "getMultipleAccounts",
    [
      slice.map((a) => a.address),
      { encoding: "jsonParsed", commitment: "confirmed" },
    ],
  );
  if (owners?.value) {
    owners.value.forEach((acc, i) => {
      const owner = acc?.data?.parsed?.info?.owner;
      const tokenAcc = slice[i].address;
      if (owner) ownerMap.set(tokenAcc, owner);
    });
  }

  const top20 = slice.map((a) => {
    const owner = ownerMap.get(a.address) ?? a.address;
    const pct = (a.uiAmount / totalSupply) * 100;
    const tag = classifyOwner(owner, { pct, ageHours });
    return {
      address: a.address,
      owner,
      amount: a.uiAmount,
      pct,
      tag,
    };
  });

  const top1Pct = top20[0]?.pct ?? null;
  const top10Sum = top20.slice(0, 10).reduce((s, h) => s + h.pct, 0);

  return {
    total: null,
    top_1_pct: top1Pct,
    top_10_pct: top10Sum || null,
    top_20: top20,
  };
}

export type RawTokenAccount = {
  pubkey: string;
  account: {
    data: { parsed: { info: { mint: string; tokenAmount: { uiAmount: number; amount: string; decimals: number } } } };
    lamports: number;
    owner: string;
  };
};

export async function getTokenAccountsByOwner(
  owner: string,
): Promise<RawTokenAccount[]> {
  const result = await rpc<{ value: RawTokenAccount[] }>(
    "getTokenAccountsByOwner",
    [
      owner,
      { programId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" },
      { encoding: "jsonParsed" },
    ],
  );
  return result?.value ?? [];
}

/**
 * Classify what an address is from a single RPC roundtrip. The on-chain
 * "owner" of the account tells us whether it's a regular wallet (owned by
 * the System Program), an SPL token mint or account (owned by the Token
 * Program), or a program. We use this to route any pasted address to the
 * right page — wallets go to /wallet/[address], mints go to /token/[ca].
 *
 * Returns "unknown" when the account doesn't exist on-chain yet (fresh
 * wallet that's never received SOL, or just a typo).
 */
export type AccountKind =
  | "wallet"        // System Program owner, normal user account
  | "token-mint"    // Token / Token-2022 program, parsed.type = "mint"
  | "token-account" // SPL token account holding a balance (NOT a mint!)
  | "program"       // executable = true
  | "unknown";

const SYSTEM_PROGRAM = "11111111111111111111111111111111";
const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const TOKEN_2022_PROGRAM = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";

type AccountInfoResp = {
  value: {
    owner?: string;
    executable?: boolean;
    lamports?: number;
    data?: {
      parsed?: { type?: string; info?: unknown };
      program?: string;
    } | unknown[];
  } | null;
};

export async function getAccountKind(address: string): Promise<{
  kind: AccountKind;
  lamports: number;
}> {
  const result = await rpc<AccountInfoResp>("getAccountInfo", [
    address,
    { encoding: "jsonParsed" },
  ]);
  const v = result?.value;
  if (!v) return { kind: "unknown", lamports: 0 };
  const lamports = v.lamports ?? 0;
  if (v.executable) return { kind: "program", lamports };
  const owner = v.owner;
  if (owner === SYSTEM_PROGRAM) return { kind: "wallet", lamports };
  if (owner === TOKEN_PROGRAM || owner === TOKEN_2022_PROGRAM) {
    const parsed =
      v.data && !Array.isArray(v.data) ? v.data.parsed : undefined;
    if (parsed?.type === "mint") return { kind: "token-mint", lamports };
    if (parsed?.type === "account") return { kind: "token-account", lamports };
  }
  return { kind: "unknown", lamports };
}

/** Lamports → SOL helper (1 SOL = 1e9 lamports). */
export function lamportsToSol(lamports: number): number {
  return lamports / 1_000_000_000;
}

/**
 * Fetch the oldest + newest transaction signatures for a wallet so we can
 * (a) compute wallet age from first activity, (b) build a 90-day activity
 * heatmap. Solana RPC's getSignaturesForAddress is paginated reverse-chrono;
 * we ask for `limit` signatures and walk back further using the `before`
 * cursor when we want history beyond the most recent batch.
 */
export type SignatureRow = {
  signature: string;
  slot: number;
  blockTime: number | null; // unix seconds
  err: unknown;
};

export async function getSignaturesForAddress(
  address: string,
  opts: { limit?: number; before?: string } = {},
): Promise<SignatureRow[]> {
  const params: [string, { limit: number; before?: string }] = [
    address,
    { limit: Math.min(1000, opts.limit ?? 1000) },
  ];
  if (opts.before) params[1].before = opts.before;
  const result = await rpc<SignatureRow[]>(
    "getSignaturesForAddress",
    params,
  );
  return result ?? [];
}

/**
 * Pull up to ~3000 signatures (3 pages of 1000) so we can render a 90-day
 * heatmap that doesn't bottom out at the most recent few hundred txns.
 * Returns oldest-first so downstream binning is straightforward.
 */
export async function getRecentSignatures(
  address: string,
  maxPages = 3,
): Promise<SignatureRow[]> {
  const all: SignatureRow[] = [];
  let before: string | undefined;
  for (let i = 0; i < maxPages; i++) {
    const page = await getSignaturesForAddress(address, { limit: 1000, before });
    if (page.length === 0) break;
    all.push(...page);
    if (page.length < 1000) break;
    before = page[page.length - 1].signature;
  }
  // Oldest first.
  return all.reverse();
}

export { HELIUS_RPC };
