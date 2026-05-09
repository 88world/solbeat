import { NextResponse } from "next/server";
import { getQuote } from "@/lib/data/jupiter";
import { isValidSolanaAddress } from "@/lib/solana/validation";
import { SOL_MINT } from "@/config/constants";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const inputMint = (url.searchParams.get("inputMint") ?? SOL_MINT).trim();
  const outputMint = (url.searchParams.get("outputMint") ?? "").trim();
  const amount = Number(url.searchParams.get("amount") ?? 0);
  const slippageBps = Number(url.searchParams.get("slippageBps") ?? 50);

  if (!isValidSolanaAddress(inputMint) || !isValidSolanaAddress(outputMint)) {
    return NextResponse.json({ error: "invalid_mint" }, { status: 400 });
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "invalid_amount" }, { status: 400 });
  }

  const quote = await getQuote({
    inputMint,
    outputMint,
    amountLamports: Math.floor(amount),
    slippageBps,
  });

  if (!quote) return NextResponse.json({ error: "no_route" }, { status: 404 });
  return NextResponse.json(quote);
}
