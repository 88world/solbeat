import { NextResponse } from "next/server";
import { isValidSolanaAddress } from "@/lib/solana/validation";
import { getAccountKind } from "@/lib/data/helius";

export const runtime = "nodejs";

/**
 * Single-roundtrip routing endpoint. Given any base58 address, returns
 * what KIND of account it is on-chain so the client can route to the
 * right page (token CA → /token/[ca], regular wallet → /wallet/[address]).
 *
 * Cached lightly because the answer is stable — an address that's been a
 * token mint for a year isn't going to become a wallet tomorrow.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ address: string }> },
) {
  const { address } = await ctx.params;
  if (!isValidSolanaAddress(address)) {
    return NextResponse.json(
      { error: "invalid_address", kind: null },
      { status: 400 },
    );
  }
  const info = await getAccountKind(address);
  return NextResponse.json(
    {
      address,
      kind: info.kind,
      lamports: info.lamports,
    },
    {
      // 5-min CDN cache — the kind of an address is stable.
      headers: { "cache-control": "public, max-age=300, s-maxage=300" },
    },
  );
}
