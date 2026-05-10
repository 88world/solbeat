import { NextResponse } from "next/server";
import { fetchWatchTokens } from "@/lib/data/dexscreener";
import { cached } from "@/lib/cache/redis";
import { TTL } from "@/config/constants";

export const dynamic = "force-dynamic";

/**
 * Recently-graduated pump.fun tokens in the post-launch survival band
 * ($500K–$1.5M mcap, 24h–14d old, healthy buy pressure). Cached 30s on
 * the server because each request collects every Solana pair from
 * DexScreener — heavy if hit per page-view.
 */
export async function GET() {
  const tokens = await cached("watch:v1", TTL.TRENDING_S, fetchWatchTokens);
  return NextResponse.json({
    tokens,
    generated_at: new Date().toISOString(),
  });
}
