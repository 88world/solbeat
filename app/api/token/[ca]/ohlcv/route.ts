import { NextResponse } from "next/server";
import { isValidSolanaAddress } from "@/lib/solana/validation";
import { fetchBestSolanaPair } from "@/lib/data/dexscreener";
import { fetchOhlcv, type Timeframe } from "@/lib/data/geckoterminal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_TF: Timeframe[] = ["1m", "5m", "15m", "1h", "4h", "1d"];

/**
 * Pulls OHLCV bars for a token's most-active pool. Resolves the pool via
 * DexScreener (same logic as the rest of the page so the chart matches the
 * pressure card) and fetches candles from GeckoTerminal.
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ ca: string }> },
) {
  const { ca } = await ctx.params;
  if (!isValidSolanaAddress(ca)) {
    return NextResponse.json({ error: "invalid_address" }, { status: 400 });
  }

  const url = new URL(req.url);
  const tfRaw = (url.searchParams.get("tf") ?? "15m") as Timeframe;
  const tf: Timeframe = VALID_TF.includes(tfRaw) ? tfRaw : "15m";
  const limit = Math.min(
    1000,
    Math.max(20, Number(url.searchParams.get("limit") ?? 200)),
  );

  const pair = await fetchBestSolanaPair(ca).catch(() => null);
  if (!pair?.pairAddress) {
    return NextResponse.json({ ca, tf, bars: [], pool: null });
  }

  const bars = await fetchOhlcv(pair.pairAddress, tf, limit);
  return NextResponse.json({
    ca,
    tf,
    bars,
    pool: pair.pairAddress,
    dex: pair.dexId,
  });
}
