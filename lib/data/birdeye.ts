const BASE = "https://public-api.birdeye.so";
const API_KEY = process.env.BIRDEYE_API_KEY ?? "";

const headers = (): Record<string, string> => ({
  "x-chain": "solana",
  "X-API-KEY": API_KEY,
  accept: "application/json",
});

export type BirdeyeOverview = {
  price: number | null;
  priceChange1h: number | null;
  priceChange24h: number | null;
  priceChange7d: number | null;
  marketCap: number | null;
  fdv: number | null;
  liquidity: number | null;
  volume24h: number | null;
  holders: number | null;
};

export async function fetchTokenOverview(
  mint: string,
): Promise<BirdeyeOverview | null> {
  if (!API_KEY) return null;
  try {
    const r = await fetch(`${BASE}/defi/token_overview?address=${mint}`, {
      headers: headers(),
      next: { revalidate: 30 },
    });
    if (!r.ok) return null;
    const json = (await r.json()) as { data?: Record<string, unknown> };
    const d = json.data ?? {};
    const num = (k: string): number | null => {
      const v = d[k];
      return typeof v === "number" && Number.isFinite(v) ? v : null;
    };
    return {
      price: num("price"),
      priceChange1h: num("priceChange1hPercent"),
      priceChange24h: num("priceChange24hPercent"),
      priceChange7d: num("priceChange7dPercent"),
      marketCap: num("marketCap") ?? num("mc"),
      fdv: num("fdv") ?? num("realMc"),
      liquidity: num("liquidity"),
      volume24h: num("v24hUSD") ?? num("volume24h"),
      holders: num("holder") ?? null,
    };
  } catch {
    return null;
  }
}

export type OhlcvPoint = { unixTime: number; open: number; high: number; low: number; close: number; volume: number };

export async function fetchOhlcv(
  mint: string,
  type: "1H" | "5m" | "15m" | "30m" | "1H" | "4H" | "1D" = "1H",
  limit = 24,
): Promise<OhlcvPoint[]> {
  if (!API_KEY) return [];
  try {
    const now = Math.floor(Date.now() / 1000);
    const interval = ohlcvSeconds(type);
    const from = now - interval * limit;
    const r = await fetch(
      `${BASE}/defi/ohlcv?address=${mint}&type=${type}&time_from=${from}&time_to=${now}`,
      { headers: headers(), next: { revalidate: 30 } },
    );
    if (!r.ok) return [];
    const json = (await r.json()) as { data?: { items?: OhlcvPoint[] } };
    return json.data?.items ?? [];
  } catch {
    return [];
  }
}

function ohlcvSeconds(t: string): number {
  switch (t) {
    case "5m": return 300;
    case "15m": return 900;
    case "30m": return 1800;
    case "1H": return 3600;
    case "4H": return 14400;
    case "1D": return 86400;
    default: return 3600;
  }
}
