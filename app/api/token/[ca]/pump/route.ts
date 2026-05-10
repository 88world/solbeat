import { NextResponse } from "next/server";
import { isValidSolanaAddress } from "@/lib/solana/validation";
import { fetchBondingCurve } from "@/lib/data/pumpfun";
import { fetchSolMacro } from "@/lib/data/dexscreener";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Lightweight pump.fun bonding curve poll. Returns null when the token
 * isn't a pump.fun token or the bonding curve PDA doesn't exist (most
 * tokens). Fast — single Helius getAccountInfo + cached SOL price.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ ca: string }> },
) {
  const { ca } = await ctx.params;
  if (!isValidSolanaAddress(ca)) {
    return NextResponse.json({ error: "invalid_address" }, { status: 400 });
  }
  const sol = await fetchSolMacro().catch(() => null);
  const curve = await fetchBondingCurve(ca, sol?.price_usd ?? null).catch(
    () => null,
  );
  return NextResponse.json({ ca, curve });
}
