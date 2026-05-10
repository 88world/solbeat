import { NextResponse } from "next/server";
import { cached } from "@/lib/cache/redis";
import { TTL } from "@/config/constants";
import { fetchSolanaNetwork } from "@/lib/data/network";
import { fetchSolanaDefi } from "@/lib/data/defillama";
import { fetchTopNFTCollections } from "@/lib/data/magiceden";
import { fetchSolMacro } from "@/lib/data/dexscreener";

export const dynamic = "force-dynamic";

/**
 * Ecosystem aggregate — Network TPS + DeFi TVL + NFT collections + SOL macro
 * in one shot. Each leaf is independently safe-async (failures bubble up as
 * nulls), so a Magic Eden 503 doesn't break the homepage. Cached server-side
 * for 5 minutes; the homepage strip polls every 30s and re-renders if the
 * cache has rolled.
 */
export async function GET() {
  const data = await cached("ecosystem:v2", TTL.TRENDING_S * 5, async () => {
    const [network, defi, nft, sol] = await Promise.all([
      fetchSolanaNetwork().catch(() => null),
      fetchSolanaDefi().catch(() => null),
      fetchTopNFTCollections(8).catch(() => null),
      fetchSolMacro().catch(() => null),
    ]);
    return {
      generated_at: new Date().toISOString(),
      network,
      defi,
      nft,
      sol,
    };
  });
  return NextResponse.json(data);
}
