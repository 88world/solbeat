import { NextResponse } from "next/server";
import { fetchTrendingFull } from "@/lib/data/dexscreener";
import { cached } from "@/lib/cache/redis";
import { TTL } from "@/config/constants";

export const runtime = "nodejs";

/**
 * Wider trending fetch for the leaderboard. Cached identically to the smaller
 * /api/trending so we don't double-poll DexScreener — the underlying
 * fetchTrendingFull pulls more results from the same multi-DEX search.
 */
export async function GET() {
  try {
    const tokens = await cached("trending:solana:full", TTL.TRENDING_S, () =>
      fetchTrendingFull(50),
    );
    return NextResponse.json({ tokens });
  } catch (err) {
    console.error("[api/trending/full] failed", err);
    return NextResponse.json({ tokens: [] }, { status: 200 });
  }
}
