import { NextResponse } from "next/server";
import { isValidSolanaAddress } from "@/lib/solana/validation";
import { getTokenAccountsByOwner } from "@/lib/data/helius";
import { fetchBestSolanaPair } from "@/lib/data/dexscreener";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ address: string }> },
) {
  const { address } = await ctx.params;
  if (!isValidSolanaAddress(address)) {
    return NextResponse.json({ error: "invalid_address" }, { status: 400 });
  }
  try {
    const accounts = await getTokenAccountsByOwner(address);
    const held = accounts.filter((a) => {
      const ui = a.account.data.parsed.info.tokenAmount.uiAmount;
      return ui != null && ui > 0;
    });
    const empty = accounts.filter((a) => {
      const ui = a.account.data.parsed.info.tokenAmount.uiAmount;
      return ui == null || ui === 0;
    });

    // Enrich top held tokens with price/symbol (best-effort, parallel, capped)
    const enriched = await Promise.all(
      held.slice(0, 24).map(async (acc) => {
        const mint = acc.account.data.parsed.info.mint;
        const ui = acc.account.data.parsed.info.tokenAmount.uiAmount;
        const pair = await fetchBestSolanaPair(mint).catch(() => null);
        const price = pair?.priceUsd ? Number(pair.priceUsd) : null;
        return {
          mint,
          symbol: pair?.baseToken.symbol ?? null,
          name: pair?.baseToken.name ?? null,
          image: pair?.info?.imageUrl ?? null,
          balance: ui ?? 0,
          price_usd: price,
          value_usd: price && ui ? price * ui : null,
          price_change_24h: pair?.priceChange?.h24 ?? null,
        };
      }),
    );

    return NextResponse.json({
      address,
      held: enriched.sort((a, b) => (b.value_usd ?? 0) - (a.value_usd ?? 0)),
      empty_account_count: empty.length,
    });
  } catch (err) {
    console.error("[api/wallet] failed", err);
    return NextResponse.json({ error: "wallet_scan_failed" }, { status: 500 });
  }
}
