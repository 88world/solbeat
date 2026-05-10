"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as d3 from "d3";
import { animate, stagger } from "animejs";
import { humanizeNumber } from "@/lib/utils";
import { TiltCard } from "@/components/shared/TiltCard";
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
  const gridRef = useRef<HTMLDivElement>(null);
  const enteredRef = useRef(false);

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

  // anime.js stagger entrance, fires once after the first data load. Each
  // card lifts and fades in 100ms behind the one before it.
  useEffect(() => {
    if (!data || enteredRef.current || !gridRef.current) return;
    enteredRef.current = true;
    const cards = gridRef.current.querySelectorAll("[data-eco-card]");
    if (cards.length === 0) return;
    // Just opacity, no translateY/scale here, those would fight the
    // TiltCard's own perspective transform on the wrapper.
    animate(cards, {
      opacity: [0, 1],
      duration: 700,
      delay: stagger(90),
      ease: "out(3)",
    });
  }, [data]);

  return (
    <div ref={gridRef} className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
      <SolCard sol={data?.sol ?? null} />
      <NetworkCard network={data?.network ?? null} />
      <DefiCard defi={data?.defi ?? null} />
      <NFTCard nft={data?.nft ?? null} />
    </div>
  );
}

/**
 * Animated count-up. anime.js tweens a plain object's value from 0 to target,
 * we mirror it into the DOM via a ref. 1.4s outExpo feels punchy without
 * rolling forever. When `value` changes, restart from current displayed
 * value so updates feel like the number "ticking up" instead of resetting.
 */
function CountUp({
  value,
  format,
  duration = 1400,
}: {
  value: number;
  format: (n: number) => string;
  duration?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const lastDisplayedRef = useRef(0);

  useEffect(() => {
    if (!ref.current || !Number.isFinite(value)) return;
    const target = value;
    const start = lastDisplayedRef.current;
    const obj = { v: start };
    const a = animate(obj, {
      v: target,
      duration,
      ease: "out(4)",
      onUpdate: () => {
        if (ref.current) ref.current.textContent = format(obj.v);
        lastDisplayedRef.current = obj.v;
      },
    });
    return () => {
      a.pause();
    };
  }, [value, format, duration]);

  return <span ref={ref}>{format(0)}</span>;
}

function CardShell({
  label,
  value,
  delta,
  deltaColor,
  children,
  accent,
}: {
  label: string;
  value: React.ReactNode;
  delta?: string;
  deltaColor?: string;
  children?: React.ReactNode;
  /** Accent color for the corner glow + hover ring. */
  accent?: string;
}) {
  const glow = accent ?? "rgba(94, 92, 255, 0.45)";
  const spotlight = accent ?? "rgba(255, 45, 156, 0.18)";
  return (
    <TiltCard
      intensity={6}
      smoothing={0.14}
      spotlightColor={spotlight}
      className="overflow-hidden"
    >
      <div
        data-eco-card
        className="px-4 sm:px-5 py-4 relative"
        style={{ opacity: 0 }}
      >
        {/* Soft corner glow that intensifies on hover. */}
        <div
          aria-hidden
          className="absolute -top-12 -right-12 size-32 rounded-full pointer-events-none"
          style={{
            background: `radial-gradient(circle, ${glow} 0%, transparent 70%)`,
            filter: "blur(8px)",
            opacity: "calc(0.5 + var(--inside, 0) * 0.5)",
            transition: "opacity 400ms ease-out",
          }}
        />
        <div className="flex items-center justify-between mb-2 relative">
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
        <div className="text-[20px] sm:text-[22px] leading-tight font-semibold text-mono tracking-tight relative">
          {value}
        </div>
        {children}
      </div>
    </TiltCard>
  );
}

function SolCard({ sol }: { sol: SolMacro | null }) {
  if (!sol) return <SkeletonCard label="SOL" />;
  const positive = (sol.price_change_24h ?? 0) >= 0;
  return (
    <CardShell
      label="SOL"
      accent="rgba(20, 241, 149, 0.45)"
      value={
        sol.price_usd != null ? (
          <>
            $<CountUp value={sol.price_usd} format={formatPrice} />
          </>
        ) : (
          "—"
        )
      }
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
      accent="rgba(94, 92, 255, 0.45)"
      value={
        <CountUp
          value={tps}
          format={(n) => Math.round(n).toLocaleString("en-US")}
        />
      }
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
      accent={
        positive ? "rgba(20, 241, 149, 0.45)" : "rgba(255, 45, 156, 0.45)"
      }
      value={
        <>
          $<CountUp value={defi.totalTvl} format={(n) => humanizeNumber(n)} />
        </>
      }
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
      accent="rgba(255, 45, 156, 0.45)"
      value={
        cheapest?.floor_sol != null ? (
          <>
            <CountUp
              value={cheapest.floor_sol}
              format={(n) => n.toFixed(2)}
            />
            <span className="ml-1">◎</span>
          </>
        ) : (
          "—"
        )
      }
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
