import { NextResponse } from "next/server";
import { fetchTrending } from "@/lib/data/dexscreener";
import { cached } from "@/lib/cache/redis";
import { TTL } from "@/config/constants";

export const runtime = "nodejs";

export async function GET() {
  try {
    const tokens = await cached("trending:solana", TTL.TRENDING_S, fetchTrending);
    return NextResponse.json({ tokens });
  } catch (err) {
    console.error("[api/trending] failed", err);
    return NextResponse.json({ tokens: [] }, { status: 200 });
  }
}
