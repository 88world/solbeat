/**
 * GeckoTerminal OHLCV fetcher. Free public API, no auth, generous CDN.
 * The cheapest path to a real candlestick chart we can render with
 * lightweight-charts. DexScreener doesn't expose history, Birdeye does
 * but requires an API key we don't have.
 *
 * Usage: fetch by pool address (DexScreener gives us pair_address). The
 * timeframe enum maps to GeckoTerminal's path segments.
 */

const BASE = "https://api.geckoterminal.com/api/v2";

export type CandleBar = {
  /** Unix seconds. */
  ts: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type Timeframe = "1m" | "5m" | "15m" | "1h" | "4h" | "1d";

const TF_PATH: Record<
  Timeframe,
  { segment: "minute" | "hour" | "day"; aggregate: number }
> = {
  "1m": { segment: "minute", aggregate: 1 },
  "5m": { segment: "minute", aggregate: 5 },
  "15m": { segment: "minute", aggregate: 15 },
  "1h": { segment: "hour", aggregate: 1 },
  "4h": { segment: "hour", aggregate: 4 },
  "1d": { segment: "day", aggregate: 1 },
};

/**
 * Fetch OHLCV bars for a Solana pool.
 *
 * @param poolAddress Solana pool address (DexScreener pair_address).
 * @param timeframe Candle interval.
 * @param limit Max bars (1..1000).
 */
export async function fetchOhlcv(
  poolAddress: string,
  timeframe: Timeframe = "15m",
  limit = 200,
): Promise<CandleBar[]> {
  if (!poolAddress) return [];
  const tf = TF_PATH[timeframe];
  const url = `${BASE}/networks/solana/pools/${poolAddress}/ohlcv/${tf.segment}?aggregate=${tf.aggregate}&limit=${limit}`;
  try {
    const r = await fetch(url, { next: { revalidate: 60 } });
    if (!r.ok) return [];
    const json = (await r.json()) as {
      data?: {
        attributes?: { ohlcv_list?: number[][] };
      };
    };
    const list = json.data?.attributes?.ohlcv_list ?? [];
    // GeckoTerminal returns newest-first; chart wants oldest-first.
    return [...list]
      .reverse()
      .filter((row) => Array.isArray(row) && row.length >= 6)
      .map((row) => ({
        ts: row[0],
        open: row[1],
        high: row[2],
        low: row[3],
        close: row[4],
        volume: row[5],
      }))
      .filter((b) => Number.isFinite(b.close) && b.close > 0);
  } catch {
    return [];
  }
}
