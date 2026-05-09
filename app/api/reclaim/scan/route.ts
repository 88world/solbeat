import { NextResponse } from "next/server";
import { isValidSolanaAddress } from "@/lib/solana/validation";
import { getTokenAccountsByOwner } from "@/lib/data/helius";
import { fetchBestSolanaPair } from "@/lib/data/dexscreener";
import { APPROX_TOKEN_ACCOUNT_RENT_LAMPORTS, FEES, LAMPORTS_PER_SOL } from "@/config/constants";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const address = (url.searchParams.get("address") ?? "").trim();
  if (!isValidSolanaAddress(address)) {
    return NextResponse.json({ error: "invalid_address" }, { status: 400 });
  }
  try {
    const accounts = await getTokenAccountsByOwner(address);
    const empties = accounts.filter((a) => {
      const ui = a.account.data.parsed.info.tokenAmount.uiAmount;
      return ui === 0 || ui == null;
    });

    // Enrich up to 30 with token metadata (capped to avoid rate limits)
    const enriched = await Promise.all(
      empties.slice(0, 60).map(async (acc) => {
        const mint = acc.account.data.parsed.info.mint;
        const lamports = acc.account.lamports || APPROX_TOKEN_ACCOUNT_RENT_LAMPORTS;
        const pair = await fetchBestSolanaPair(mint).catch(() => null);
        return {
          pubkey: acc.pubkey,
          mint,
          rent_lamports: lamports,
          symbol: pair?.baseToken.symbol ?? null,
          name: pair?.baseToken.name ?? null,
          image: pair?.info?.imageUrl ?? null,
        };
      }),
    );

    const totalLamports = enriched.reduce((s, a) => s + a.rent_lamports, 0);
    const totalSol = totalLamports / LAMPORTS_PER_SOL;
    const feeSol = (totalSol * FEES.RECLAIM_BPS) / 10_000;
    const userSol = totalSol - feeSol;

    return NextResponse.json({
      address,
      account_count: enriched.length,
      total_reclaimable_sol: totalSol,
      fee_sol: feeSol,
      user_receives_sol: userSol,
      fee_bps: FEES.RECLAIM_BPS,
      accounts: enriched,
    });
  } catch (err) {
    console.error("[api/reclaim/scan] failed", err);
    return NextResponse.json({ error: "scan_failed" }, { status: 500 });
  }
}
