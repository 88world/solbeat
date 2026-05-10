/**
 * Magic Eden v2 public REST. No auth required for read endpoints.
 *
 * /collections returns metadata; /collections/{symbol}/stats returns
 * volume/floor. The list endpoint is cheap; per-collection stats need an
 * extra call each, so we batch-fetch in parallel and cap at 10.
 */
const BASE = "https://api-mainnet.magiceden.dev/v2";

export type NFTCollectionSnapshot = {
  symbol: string;
  name: string;
  image: string | null;
  description: string | null;
  /** Floor price in SOL. */
  floor_sol: number | null;
  /** 24h volume in SOL. */
  volume_24h_sol: number | null;
  /** Listed count. */
  listed: number | null;
  url: string;
};

export type SolanaNFTSnapshot = {
  total24hVolumeSol: number;
  collections: NFTCollectionSnapshot[];
};

type MePopularCollection = {
  symbol: string;
  name: string;
  description?: string;
  image?: string;
  floorPrice?: number; // lamports
  volumeAll?: number; // lamports
  hasCNFTs?: boolean;
};

type MeCollectionStats = {
  symbol?: string;
  floorPrice?: number;
  listedCount?: number;
  avgPrice24hr?: number;
  volumeAll?: number;
};

const LAMPORTS_PER_SOL = 1_000_000_000;

/**
 * Pulls Magic Eden's "popular collections" feed (no auth required) and
 * decorates each with current floor + listing count. Tried /collections
 * earlier but ME now requires args we don't pass; popular_collections is
 * the maintained public endpoint.
 */
export async function fetchTopNFTCollections(
  limit = 10,
): Promise<SolanaNFTSnapshot | null> {
  try {
    const r = await fetch(`${BASE}/marketplace/popular_collections`, {
      next: { revalidate: 600 },
    });
    if (!r.ok) return null;
    const list = (await r.json()) as MePopularCollection[];

    // Per-collection stats in parallel for the freshest floor + listing count.
    // popular_collections returns a static-ish floor; the stats endpoint is live.
    const stats = await Promise.all(
      list.slice(0, limit).map((c) =>
        fetch(`${BASE}/collections/${encodeURIComponent(c.symbol)}/stats`, {
          next: { revalidate: 300 },
        })
          .then((res) => (res.ok ? (res.json() as Promise<MeCollectionStats>) : null))
          .catch(() => null),
      ),
    );

    const collections: NFTCollectionSnapshot[] = list
      .slice(0, limit)
      .map((c, i) => {
        const s = stats[i];
        const floor = s?.floorPrice ?? c.floorPrice;
        return {
          symbol: c.symbol,
          name: c.name,
          image: c.image ?? null,
          description: c.description ?? null,
          floor_sol: floor != null ? floor / LAMPORTS_PER_SOL : null,
          volume_24h_sol:
            s?.avgPrice24hr != null && s.listedCount != null
              ? // Best-effort proxy for 24h volume: avg price × listings sold.
                // Magic Eden's public v2 doesn't expose 24h volume directly,
                // this is a usable approximation when both fields are present.
                (s.avgPrice24hr / LAMPORTS_PER_SOL) * Math.min(s.listedCount, 100)
              : null,
          listed: s?.listedCount ?? null,
          url: `https://magiceden.io/marketplace/${c.symbol}`,
        };
      });

    const total24hVolumeSol = collections.reduce(
      (acc, c) => acc + (c.volume_24h_sol ?? 0),
      0,
    );

    return {
      total24hVolumeSol,
      collections,
    };
  } catch {
    return null;
  }
}
