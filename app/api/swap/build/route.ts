import { NextResponse } from "next/server";
import { getSwapTransaction, type JupiterQuote } from "@/lib/data/jupiter";
import { isValidSolanaAddress } from "@/lib/solana/validation";

export const runtime = "nodejs";

const FEE_ACCOUNT = process.env.NEXT_PUBLIC_JUPITER_REFERRAL_ACCOUNT;

export async function POST(req: Request) {
  let body: { quote?: JupiterQuote; userPublicKey?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const userPublicKey = (body.userPublicKey ?? "").trim();
  if (!isValidSolanaAddress(userPublicKey)) {
    return NextResponse.json({ error: "invalid_user_key" }, { status: 400 });
  }
  if (!body.quote) {
    return NextResponse.json({ error: "missing_quote" }, { status: 400 });
  }
  const result = await getSwapTransaction({
    quote: body.quote,
    userPublicKey,
    feeAccount: FEE_ACCOUNT && isValidSolanaAddress(FEE_ACCOUNT) ? FEE_ACCOUNT : undefined,
  });
  if (!result) return NextResponse.json({ error: "swap_failed" }, { status: 502 });
  return NextResponse.json(result);
}
