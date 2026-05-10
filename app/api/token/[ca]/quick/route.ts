import { NextResponse } from "next/server";
import { isValidSolanaAddress } from "@/lib/solana/validation";
import { fetchBestSolanaPair } from "@/lib/data/dexscreener";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Lightweight live-poll endpoint. DexScreener-only, no AI, no Helius RPC,
 * no Perplexity. Returns just the fast-changing market shape so the token
 * page can re-render the price card every 30s without re-running the full
 * analyzer pipeline.
 *
 * Typical response: ~500ms cold, <50ms warm via DexScreener's CDN cache.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ ca: string }> },
) {
  const { ca } = await ctx.params;
  if (!isValidSolanaAddress(ca)) {
    return NextResponse.json({ error: "invalid_address" }, { status: 400 });
  }

  const pair = await fetchBestSolanaPair(ca).catch(() => null);
  if (!pair) {
    return NextResponse.json({ error: "no_data" }, { status: 404 });
  }

  return NextResponse.json({
    ca,
    fetched_at: new Date().toISOString(),
    price_usd: pair.priceUsd ? Number(pair.priceUsd) : null,
    price_change_5m: pair.priceChange?.m5 ?? null,
    price_change_1h: pair.priceChange?.h1 ?? null,
    price_change_6h: pair.priceChange?.h6 ?? null,
    price_change_24h: pair.priceChange?.h24 ?? null,
    volume_5m: pair.volume?.m5 ?? null,
    volume_1h: pair.volume?.h1 ?? null,
    volume_24h: pair.volume?.h24 ?? null,
    liquidity_usd: pair.liquidity?.usd ?? null,
    market_cap: pair.marketCap ?? null,
    fdv: pair.fdv ?? null,
  });
}
