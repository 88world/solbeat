import { NextResponse } from "next/server";
import { fetchTrending, fetchSolMacro } from "@/lib/data/dexscreener";
import { cached } from "@/lib/cache/redis";
import { TTL } from "@/config/constants";

export const runtime = "nodejs";

export async function GET() {
  try {
    // Cached separately so the SOL macro refreshes at the same TTL but the
    // trending list isn't held back by SOL fetch latency on cold cache.
    const [tokens, sol] = await Promise.all([
      cached("trending:solana", TTL.TRENDING_S, fetchTrending),
      cached("trending:solmacro", TTL.TRENDING_S, fetchSolMacro),
    ]);
    return NextResponse.json({ tokens, sol });
  } catch (err) {
    console.error("[api/trending] failed", err);
    return NextResponse.json({ tokens: [], sol: null }, { status: 200 });
  }
}
