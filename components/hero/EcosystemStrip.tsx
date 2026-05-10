"use client";

import { useEffect, useMemo, useState } from "react";
import * as d3 from "d3";
import { humanizeNumber } from "@/lib/utils";
import type { NetworkSnapshot } from "@/lib/data/network";
import type { SolanaDefiSnapshot } from "@/lib/data/defillama";
import type { SolanaNFTSnapshot } from "@/lib/data/magiceden";
import type { SolMacro } from "@/lib/data/dexscreener";

type EcosystemPayload = {
  network: NetworkSnapshot | null;
  defi: SolanaDefiSnapshot | null;
  nft: SolanaNFTSnapshot | null;
  sol: SolMacro | null;
};

/**
 * Live ecosystem strip on the homepage hero, four compact cards showing
 * Solana-wide health: SOL macro, network TPS, DeFi TVL, NFT activity. Each
 * card has a D3-rendered micro-chart so the user reads the trajectory, not
 * just the headline number.
 *
 * Polls /api/ecosystem every 30s. Server-side response is cached 5min so
 * the underlying data sources only get hit a few times per hour even with
 * many simultaneous viewers.
 */
export function EcosystemStrip() {
  const [data, setData] = useState<EcosystemPayload | null>(null);

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      try {
        const r = await fetch("/api/ecosystem", { cache: "no-store" });
        if (!r.ok) return;
        const json = (await r.json()) as EcosystemPayload;
        if (!cancelled) setData(json);
      } catch {
        /* noop */
      }
    };
    refresh();
    const id = setInterval(refresh, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
      <SolCard sol={data?.sol ?? null} />
      <NetworkCard network={data?.network ?? null} />
      <DefiCard defi={data?.defi ?? null} />
      <NFTCard nft={data?.nft ?? null} />
    </div>
  );
}

function CardShell({
  label,
  value,
  delta,
  deltaColor,
  children,
}: {
  label: string;
  value: string;
  delta?: string;
  deltaColor?: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      className="rounded-2xl px-4 sm:px-5 py-4 relative overflow-hidden"
      style={{
        background: "rgba(255, 255, 255, 0.65)",
        backdropFilter: "blur(20px) saturate(160%)",
        WebkitBackdropFilter: "blur(20px) saturate(160%)",
        border: "1px solid rgba(10, 10, 30, 0.06)",
        boxShadow: "0 6px 18px rgba(10, 10, 30, 0.04)",
      }}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="text-[9.5px] uppercase tracking-[0.20em] text-text-muted font-bold">
          {label}
        </div>
        {delta != null && (
          <div
            className="text-[10.5px] font-semibold text-mono"
            style={{ color: deltaColor }}
          >
            {delta}
          </div>
        )}
      </div>
      <div className="text-[20px] sm:text-[22px] leading-tight font-semibold text-mono tracking-tight">
        {value}
      </div>
      {children}
    </div>
  );
}

function SolCard({ sol }: { sol: SolMacro | null }) {
  if (!sol) return <SkeletonCard label="SOL" />;
  const positive = (sol.price_change_24h ?? 0) >= 0;
  return (
    <CardShell
      label="SOL"
      value={sol.price_usd != null ? `$${formatPrice(sol.price_usd)}` : "—"}
      delta={
        sol.price_change_24h != null
          ? `${positive ? "+" : ""}${sol.price_change_24h.toFixed(1)}%`
          : undefined
      }
      deltaColor={positive ? "#0a8f57" : "#c1374a"}
    >
      <div className="text-[10.5px] text-text-muted mt-1.5">
        24h vol ${sol.volume_24h != null ? humanizeNumber(sol.volume_24h) : "—"}
      </div>
    </CardShell>
  );
}

function NetworkCard({ network }: { network: NetworkSnapshot | null }) {
  if (!network) return <SkeletonCard label="Network" />;
  const tps = Math.round(network.currentTps);
  return (
    <CardShell
      label="Network · TPS"
      value={tps.toLocaleString("en-US")}
      delta={`epoch ${network.epoch}`}
      deltaColor="#5a5a70"
    >
      <Sparkline
        data={network.tpsHistory}
        color="#5e5cff"
        height={26}
        gradientId="ecosys-tps"
      />
    </CardShell>
  );
}

function DefiCard({ defi }: { defi: SolanaDefiSnapshot | null }) {
  if (!defi) return <SkeletonCard label="DeFi · TVL" />;
  const positive = defi.change_24h >= 0;
  return (
    <CardShell
      label="DeFi · TVL"
      value={`$${humanizeNumber(defi.totalTvl)}`}
      delta={`${positive ? "+" : ""}${defi.change_24h.toFixed(2)}%`}
      deltaColor={positive ? "#0a8f57" : "#c1374a"}
    >
      <Sparkline
        data={defi.tvl30d}
        color={positive ? "#0a8f57" : "#c1374a"}
        height={26}
        gradientId="ecosys-tvl"
      />
    </CardShell>
  );
}

function NFTCard({ nft }: { nft: SolanaNFTSnapshot | null }) {
  if (!nft) return <SkeletonCard label="NFT" />;
  const totalListed = nft.collections.reduce(
    (acc, c) => acc + (c.listed ?? 0),
    0,
  );
  const cheapest = nft.collections
    .filter((c) => c.floor_sol != null)
    .sort((a, b) => (a.floor_sol ?? 0) - (b.floor_sol ?? 0))[0];
  return (
    <CardShell
      label={`NFT · top ${nft.collections.length}`}
      value={cheapest?.floor_sol != null ? `${cheapest.floor_sol.toFixed(2)} ◎` : "—"}
      delta={`${totalListed.toLocaleString("en-US")} listed`}
      deltaColor="#5a5a70"
    >
      <div className="mt-1.5 flex items-center gap-1">
        {nft.collections.slice(0, 5).map((c) => (
          <span
            key={c.symbol}
            className="size-5 rounded-md bg-white/40 overflow-hidden border border-border-subtle shrink-0"
            title={`${c.name} · ${c.floor_sol != null ? c.floor_sol.toFixed(2) + " ◎" : ""}`}
          >
            {c.image && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={c.image}
                alt={c.name}
                className="size-full object-cover"
                referrerPolicy="no-referrer"
              />
            )}
          </span>
        ))}
      </div>
    </CardShell>
  );
}

function Sparkline({
  data,
  color,
  height,
  gradientId,
}: {
  data: number[];
  color: string;
  height: number;
  gradientId: string;
}) {
  const width = 240;
  const path = useMemo(() => {
    if (data.length < 2) return { line: "", area: "" };
    const x = d3
      .scaleLinear()
      .domain([0, data.length - 1])
      .range([0, width]);
    const ext = d3.extent(data) as [number, number];
    const min = ext[0] * 0.98;
    const max = ext[1] * 1.02;
    const y = d3.scaleLinear().domain([min, max]).range([height, 2]);
    const line = d3
      .line<number>()
      .x((_, i) => x(i))
      .y((d) => y(d))
      .curve(d3.curveMonotoneX);
    const area = d3
      .area<number>()
      .x((_, i) => x(i))
      .y0(height)
      .y1((d) => y(d))
      .curve(d3.curveMonotoneX);
    return { line: line(data) ?? "", area: area(data) ?? "" };
  }, [data, height]);

  if (data.length < 2) return null;

  return (
    <svg
      className="mt-2 w-full"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      style={{ display: "block", height }}
      aria-hidden
    >
      <defs>
        <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.30" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={path.area} fill={`url(#${gradientId})`} />
      <path
        d={path.line}
        fill="none"
        stroke={color}
        strokeWidth={1.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SkeletonCard({ label }: { label: string }) {
  return (
    <div
      className="rounded-2xl px-4 sm:px-5 py-4 animate-shimmer"
      style={{
        background: "rgba(255, 255, 255, 0.45)",
        border: "1px solid rgba(10, 10, 30, 0.04)",
        minHeight: 92,
      }}
    >
      <div className="text-[9.5px] uppercase tracking-[0.20em] text-text-muted font-bold mb-2">
        {label}
      </div>
      <div className="h-5 w-20 rounded bg-text-muted/10 mb-2" />
      <div className="h-3 w-32 rounded bg-text-muted/8" />
    </div>
  );
}

function formatPrice(p: number): string {
  if (p >= 100) return p.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (p >= 1) return p.toFixed(2);
  if (p >= 0.01) return p.toFixed(4);
  return p.toFixed(6);
}
