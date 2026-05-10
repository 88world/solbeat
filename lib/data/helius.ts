import type { TokenHolders, TokenMetadata } from "@/types/token";
import { LIMITS } from "@/config/constants";

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

export async function getAsset(mint: string): Promise<TokenMetadata | null> {
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

export async function getTokenHolders(
  mint: string,
  totalSupply: number | null,
): Promise<TokenHolders> {
  const result = await rpc<{ value: LargestAccount[] }>(
    "getTokenLargestAccounts",
    [mint, { commitment: "confirmed" }],
  );

  const accounts = result?.value ?? [];
  if (accounts.length === 0 || !totalSupply || totalSupply <= 0) {
    return { total: null, top_1_pct: null, top_10_pct: null, top_20: [] };
  }

  const top20 = accounts.slice(0, LIMITS.HOLDER_TOP_N).map((a) => ({
    address: a.address,
    amount: a.uiAmount,
    pct: (a.uiAmount / totalSupply) * 100,
  }));

  const top1Pct = top20[0]?.pct ?? null;
  const top10Sum = top20.slice(0, 10).reduce((s, h) => s + h.pct, 0);

  return {
    total: null, // not directly available, would need getProgramAccounts
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

export { HELIUS_RPC };
