import { NextResponse } from "next/server";
import { isValidSolanaAddress } from "@/lib/solana/validation";
import { fetchRecentTweets } from "@/lib/data/twitter";

export const runtime = "nodejs";

/**
 * On-demand tweets endpoint backing the lazy-load Social Signal panel.
 *
 * Decoupled from the analyzeSlow synthesis path so a token-page visitor
 * who never clicks "View tweets" doesn't pay for the tweet payload in
 * the initial HTML render. Both this endpoint and the synthesis path
 * call into `fetchRecentTweets`, which is Upstash-cached at 30min — so
 * actual twitterapi.io calls are bounded to one per CA per 30min
 * regardless of how many users view OR click.
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ ca: string }> },
) {
  const { ca } = await ctx.params;
  if (!isValidSolanaAddress(ca)) {
    return NextResponse.json(
      { error: "invalid_address", tweets: [] },
      { status: 400 },
    );
  }
  // Symbol is a hint for the query (`($SYMBOL OR ca) lang:en`). When the
  // caller doesn't have it, we fall back to a CA-prefix proxy.
  const url = new URL(req.url);
  const symbol = url.searchParams.get("symbol") ?? ca.slice(0, 6);

  try {
    const tweets = await fetchRecentTweets(symbol, ca);
    return NextResponse.json(
      { tweets },
      { headers: { "cache-control": "public, max-age=60" } },
    );
  } catch (err) {
    console.error("[api/tweets] failed", err);
    return NextResponse.json(
      { tweets: [], error: "fetch_failed" },
      { status: 500 },
    );
  }
}
