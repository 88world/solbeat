/**
 * Solana network-level metrics. Pulled from our existing Helius RPC (the
 * NEXT_PUBLIC_SOLANA_RPC env). Two methods:
 *
 *   - getRecentPerformanceSamples, returns last N 60s samples of TPS
 *   - getEpochInfo, current slot/epoch
 *   - getSupply, total + circulating SOL
 *
 * Used by the homepage Ecosystem strip (TPS gauge) and /ecosystem.
 */
const RPC = process.env.NEXT_PUBLIC_SOLANA_RPC ?? "https://api.mainnet-beta.solana.com";

export type NetworkSnapshot = {
  /** Transactions per second from the most recent ~60s sample. */
  currentTps: number;
  /** Average TPS across the last hour. */
  avgTps_1h: number;
  /** Last 60 1-min TPS samples, oldest first. */
  tpsHistory: number[];
  slot: number;
  epoch: number;
  /** 0..1, fraction of the epoch elapsed. */
  epochProgress: number;
  /** Total SOL supply. */
  totalSupplySol: number;
  /** Circulating SOL supply. */
  circulatingSupplySol: number;
};

async function rpcCall<T>(method: string, params: unknown[] = []): Promise<T | null> {
  try {
    const r = await fetch(RPC, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      // Cache 30s; TPS doesn't move much within a minute and the homepage
      // strip refetches periodically anyway.
      next: { revalidate: 30 },
    });
    if (!r.ok) return null;
    const json = (await r.json()) as { result?: T; error?: unknown };
    return json.result ?? null;
  } catch {
    return null;
  }
}

type PerfSample = {
  slot: number;
  numTransactions: number;
  numNonVoteTransaction?: number;
  samplePeriodSecs: number;
};

type EpochInfo = {
  absoluteSlot: number;
  epoch: number;
  slotIndex: number;
  slotsInEpoch: number;
  blockHeight: number;
  transactionCount?: number;
};

type Supply = {
  context: { slot: number };
  value: { total: number; circulating: number; nonCirculating: number };
};

export async function fetchSolanaNetwork(): Promise<NetworkSnapshot | null> {
  const [perf, epoch, supply] = await Promise.all([
    rpcCall<PerfSample[]>("getRecentPerformanceSamples", [60]),
    rpcCall<EpochInfo>("getEpochInfo", []),
    rpcCall<Supply>("getSupply", [{ commitment: "confirmed" }]),
  ]);

  if (!perf || !epoch) return null;

  // perf samples are newest-first from the RPC; reverse for chronological order.
  // Use *non-vote* transactions when available (closer to "real" tx count) and
  // fall back to total. Filter zero-period samples to avoid divide-by-zero.
  const samples = [...perf].reverse().filter((s) => s.samplePeriodSecs > 0);
  const tpsHistory = samples.map((s) =>
    (s.numNonVoteTransaction ?? s.numTransactions) / s.samplePeriodSecs,
  );
  const currentTps = tpsHistory[tpsHistory.length - 1] ?? 0;
  const avgTps_1h =
    tpsHistory.length > 0
      ? tpsHistory.reduce((a, b) => a + b, 0) / tpsHistory.length
      : 0;

  const epochProgress =
    epoch.slotsInEpoch > 0 ? epoch.slotIndex / epoch.slotsInEpoch : 0;

  const totalSupplySol = supply
    ? supply.value.total / 1_000_000_000
    : 0;
  const circulatingSupplySol = supply
    ? supply.value.circulating / 1_000_000_000
    : 0;

  return {
    currentTps,
    avgTps_1h,
    tpsHistory,
    slot: epoch.absoluteSlot,
    epoch: epoch.epoch,
    epochProgress,
    totalSupplySol,
    circulatingSupplySol,
  };
}
