/**
 * DefiLlama is the canonical free TVL source. No auth, no rate-limit headers,
 * generous CDN. We pull two endpoints:
 *
 *   - /v2/historicalChainTvl/Solana, daily TVL for ~7y of Solana
 *   - /protocols, every protocol they index, filter for Solana
 *
 * Used by the homepage Ecosystem strip and the /ecosystem deep-dive.
 */
const BASE = "https://api.llama.fi";

export type DefiLlamaProtocol = {
  name: string;
  slug: string;
  logo: string | null;
  category: string | null;
  tvl: number;
  change_1d: number | null;
  change_7d: number | null;
  url: string | null;
};

export type SolanaDefiSnapshot = {
  totalTvl: number;
  /** Most recent 30 daily samples; oldest first. */
  tvl30d: number[];
  change_24h: number;
  change_7d: number;
  /** Top 12 by TVL. */
  topProtocols: DefiLlamaProtocol[];
};

export async function fetchSolanaDefi(): Promise<SolanaDefiSnapshot | null> {
  try {
    const [tvlR, protocolsR] = await Promise.all([
      fetch(`${BASE}/v2/historicalChainTvl/Solana`, {
        next: { revalidate: 600 },
      }),
      fetch(`${BASE}/protocols`, { next: { revalidate: 600 } }),
    ]);

    if (!tvlR.ok || !protocolsR.ok) return null;

    const tvlSeries = (await tvlR.json()) as Array<{ date: number; tvl: number }>;
    const protocols = (await protocolsR.json()) as Array<{
      name: string;
      slug?: string;
      logo?: string | null;
      category?: string | null;
      chains?: string[];
      tvl?: number;
      change_1d?: number | null;
      change_7d?: number | null;
      url?: string | null;
      chainTvls?: Record<string, number | undefined>;
    }>;

    const last30 = tvlSeries.slice(-30).map((p) => p.tvl);
    const totalTvl = last30[last30.length - 1] ?? 0;
    const yesterdayTvl = last30[last30.length - 2] ?? totalTvl;
    const weekAgoTvl = last30[last30.length - 8] ?? totalTvl;
    const change_24h =
      yesterdayTvl > 0 ? ((totalTvl - yesterdayTvl) / yesterdayTvl) * 100 : 0;
    const change_7d =
      weekAgoTvl > 0 ? ((totalTvl - weekAgoTvl) / weekAgoTvl) * 100 : 0;

    // Per-protocol TVL: the top-level `tvl` field is global. For Solana-specific
    // TVL we want chainTvls.Solana. Protocols without a Solana TVL get filtered.
    const solProtocols: DefiLlamaProtocol[] = protocols
      .filter((p) => p.chains?.includes("Solana"))
      .map((p) => {
        const solTvl = p.chainTvls?.Solana ?? p.tvl ?? 0;
        return {
          name: p.name,
          slug: p.slug ?? p.name.toLowerCase().replace(/\s+/g, "-"),
          logo: p.logo ?? null,
          category: p.category ?? null,
          tvl: solTvl,
          change_1d: p.change_1d ?? null,
          change_7d: p.change_7d ?? null,
          url: p.url ?? null,
        };
      })
      .filter((p) => p.tvl > 1_000_000) // dust threshold
      .sort((a, b) => b.tvl - a.tvl)
      .slice(0, 12);

    return {
      totalTvl,
      tvl30d: last30,
      change_24h,
      change_7d,
      topProtocols: solProtocols,
    };
  } catch {
    return null;
  }
}
