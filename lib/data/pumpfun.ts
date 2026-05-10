import { PublicKey } from "@solana/web3.js";

/**
 * Pump.fun bonding-curve fetcher. Reads the on-chain bonding curve PDA
 * directly via Helius RPC, no third-party API.
 *
 * Why this matters: pump.fun tokens trade against a bonding curve until
 * they hit the migration threshold (~$69k mcap → ~85 SOL in the curve →
 * ~793M tokens sold), at which point liquidity migrates to PumpSwap or
 * Raydium. Until graduation, the price is 100% determined by the curve;
 * after graduation it trades on a normal AMM.
 *
 * Knowing where on the curve a token is = knowing how close it is to a
 * liquidity event. Photon, Axiom, BullX all surface this; we didn't.
 *
 * If the token isn't a pump.fun token (or has already graduated and the
 * bonding curve PDA is closed), the function returns null. The caller
 * just doesn't render the card.
 */

const PUMP_FUN_PROGRAM_ID = new PublicKey(
  "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P",
);

// Reserve tokens — pump.fun keeps 206.9M out of every 1B for the migration.
// 793.1M is the "for sale" portion that drains as the curve fills.
//
// NOTE: pump.fun mints have 6 decimals, on-chain reserves are stored in
// raw units (token_amount × 10^6). All math here uses the raw representation;
// we divide by 1e6 only when displaying.
const TOKEN_DECIMALS = 6;
const DECIMAL_MULTIPLIER = 10 ** TOKEN_DECIMALS;
const TOTAL_SUPPLY = 1_000_000_000;
const RESERVED_TOKENS = 206_900_000;
const INITIAL_REAL_TOKEN_RESERVES_TOKENS = TOTAL_SUPPLY - RESERVED_TOKENS;
const INITIAL_REAL_TOKEN_RESERVES_RAW =
  INITIAL_REAL_TOKEN_RESERVES_TOKENS * DECIMAL_MULTIPLIER;
const RESERVED_TOKENS_RAW = RESERVED_TOKENS * DECIMAL_MULTIPLIER;

const RPC =
  process.env.NEXT_PUBLIC_SOLANA_RPC ?? "https://api.mainnet-beta.solana.com";

export type BondingCurveSnapshot = {
  /** True if the token is a pump.fun token. */
  is_pump: boolean;
  /** True if the token has already graduated (migrated to PumpSwap/Raydium). */
  graduated: boolean;
  /** 0..100. */
  progress_pct: number;
  /** SOL currently in the curve (real, not virtual). */
  sol_in_curve: number;
  /** Tokens left to sell before migration. */
  tokens_left: number;
  /** Tokens already sold from the curve. */
  tokens_sold: number;
  /** Marketcap right now per the curve, in USD if SOL price provided. */
  curve_mcap_usd: number | null;
};

/**
 * Derive the bonding curve PDA for a pump.fun mint.
 *   seeds: [b"bonding-curve", mint_bytes]
 *   programId: pump.fun program
 */
function bondingCurvePda(mint: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("bonding-curve"), mint.toBuffer()],
    PUMP_FUN_PROGRAM_ID,
  );
  return pda;
}

type RpcResp<T> = { result?: T; error?: { message: string } };

async function rpc<T>(method: string, params: unknown[]): Promise<T | null> {
  try {
    const r = await fetch(RPC, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      next: { revalidate: 30 },
    });
    if (!r.ok) return null;
    const json = (await r.json()) as RpcResp<T>;
    return json.result ?? null;
  } catch {
    return null;
  }
}

type AccountInfoResp = {
  value: {
    data: [string, string]; // [base64, encoding]
    executable: boolean;
    lamports: number;
    owner: string;
    rentEpoch: number;
  } | null;
};

/**
 * Read the bonding curve account. Anchor account layout (after 8-byte
 * discriminator, 5 u64 + 1 bool):
 *
 *   offset 8  : virtualTokenReserves    (u64 LE)
 *   offset 16 : virtualSolReserves      (u64 LE)
 *   offset 24 : realTokenReserves       (u64 LE)
 *   offset 32 : realSolReserves         (u64 LE)
 *   offset 40 : tokenTotalSupply        (u64 LE)
 *   offset 48 : complete                (bool, 1 byte)
 */
export async function fetchBondingCurve(
  mint: string,
  solUsdPrice: number | null = null,
): Promise<BondingCurveSnapshot | null> {
  let mintPk: PublicKey;
  try {
    mintPk = new PublicKey(mint);
  } catch {
    return null;
  }

  const pda = bondingCurvePda(mintPk).toBase58();
  const accountInfo = await rpc<AccountInfoResp>("getAccountInfo", [
    pda,
    { encoding: "base64", commitment: "confirmed" },
  ]);

  if (!accountInfo?.value) {
    // PDA doesn't exist. Either not a pump.fun token, or it graduated and
    // the PDA was closed. We can't distinguish without other signals.
    return null;
  }

  // Account exists but isn't owned by pump.fun → wrong program.
  if (accountInfo.value.owner !== PUMP_FUN_PROGRAM_ID.toBase58()) {
    return null;
  }

  const buf = Buffer.from(accountInfo.value.data[0], "base64");
  if (buf.length < 49) return null;

  // u64 LE. Pump's reserves are stored in raw token units (×1e6).
  // 793.1M tokens × 1e6 decimals = 7.931e14, well under 2^53 (~9e15).
  const realTokenReservesRaw = readU64LE(buf, 24);
  const realSolReserves = readU64LE(buf, 32);
  const complete = buf[48] === 1;

  // Subtract the reserved-for-migration portion to get "tokens still available
  // to buy through the curve."
  const tokensLeftRaw = Math.max(0, realTokenReservesRaw - RESERVED_TOKENS_RAW);
  const tokensSoldRaw = INITIAL_REAL_TOKEN_RESERVES_RAW - tokensLeftRaw;
  const progress = complete
    ? 100
    : Math.max(
        0,
        Math.min(100, (tokensSoldRaw / INITIAL_REAL_TOKEN_RESERVES_RAW) * 100),
      );

  // Convert back to token units for display.
  const tokensLeft = tokensLeftRaw / DECIMAL_MULTIPLIER;
  const tokensSold = tokensSoldRaw / DECIMAL_MULTIPLIER;

  const solInCurve = realSolReserves / 1e9;

  // Approximate marketcap from the curve.
  const pricePerTokenSol = tokensSold > 0 ? solInCurve / tokensSold : 0;
  const fdvSol = pricePerTokenSol * TOTAL_SUPPLY;
  const mcapUsd = solUsdPrice != null ? fdvSol * solUsdPrice : null;

  return {
    is_pump: true,
    graduated: complete,
    progress_pct: progress,
    sol_in_curve: solInCurve,
    tokens_left: tokensLeft,
    tokens_sold: tokensSold,
    curve_mcap_usd: mcapUsd,
  };
}

function readU64LE(buf: Buffer, offset: number): number {
  // Safe for values < 2^53. Pump's u64s never exceed that in practice.
  // BigInt conversion would be safer but the JS<->number coercion adds friction.
  const lo = buf.readUInt32LE(offset);
  const hi = buf.readUInt32LE(offset + 4);
  return hi * 0x100000000 + lo;
}
