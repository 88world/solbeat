"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { animate } from "animejs";
import type { TokenAnalysis, TokenMarket } from "@/types/token";
import { humanizeNumber } from "@/lib/utils";

/** Rolling history of buy% per tab, used for the micro-trend sparkline. */
const HISTORY_LIMIT = 24;

type Props = {
  analysis: TokenAnalysis;
};

type LiveMarket = Pick<
  TokenMarket,
  | "txns_5m"
  | "txns_1h"
  | "txns_6h"
  | "txns_24h"
  | "volume_5m"
  | "volume_1h"
  | "volume_6h"
  | "volume_24h"
>;

/**
 * Buy/sell pressure card. The first-row degen scan that DexScreener and
 * Photon spend their entire UI on, currently missing from SolBeat.
 *
 *   - Big horizontal bar split between buy $ and sell $ across the active
 *     timeframe. Color saturation grows with imbalance.
 *   - Net pressure verdict in plain English: "Heavy buying" / "Buyers in
 *     control" / "Two-sided" / "Sellers in control" / "Heavy selling".
 *   - 4-tab timeframe switcher (5m / 1h / 6h / 24h). Each tab pre-renders
 *     so switching is instant.
 *   - Small numbers underneath: buy count / sell count / dollar values.
 *
 * Dollar amounts are derived because DexScreener exposes counts only:
 *   buy$ = volume × buys / (buys + sells)
 *   sell$ = volume × sells / (buys + sells)
 * Approximate but the right shape, the user reads "60% buys, 40% sells"
 * far better than absolute counts.
 *
 * Also polls /api/token/[ca]/quick every 8s so the bar moves live without
 * a page reload.
 */
export function BuySellPressure({ analysis }: Props) {
  const [tab, setTab] = useState<"5m" | "1h" | "6h" | "24h">("1h");
  const [live, setLive] = useState<LiveMarket | null>(null);
  // Per-tab rolling history of buy% so the user sees the *trajectory* of
  // pressure across the last ~3min of polling, not just the latest snap.
  // Kept in a ref to avoid re-rendering on every poll; we mirror an
  // observable counter into state so the sparkline component picks up
  // updates without ref-reads in the render path.
  const historyRef = useRef<Record<"5m" | "1h" | "6h" | "24h", number[]>>({
    "5m": [],
    "1h": [],
    "6h": [],
    "24h": [],
  });
  const [historyTick, setHistoryTick] = useState(0);

  // Poll the quick endpoint on the same 8s cadence as the rest of the page.
  useEffect(() => {
    if (!analysis.metadata.ca) return;
    let cancelled = false;
    const refresh = async () => {
      try {
        const r = await fetch(`/api/token/${analysis.metadata.ca}/quick`, {
          cache: "no-store",
        });
        if (!r.ok) return;
        const data = (await r.json()) as Record<string, unknown>;
        if (cancelled) return;
        setLive({
          txns_5m: (data.txns_5m as TokenMarket["txns_5m"]) ?? null,
          txns_1h: (data.txns_1h as TokenMarket["txns_1h"]) ?? null,
          txns_6h: (data.txns_6h as TokenMarket["txns_6h"]) ?? null,
          txns_24h: (data.txns_24h as TokenMarket["txns_24h"]) ?? null,
          volume_5m: (data.volume_5m as number | null) ?? null,
          volume_1h: (data.volume_1h as number | null) ?? null,
          volume_6h: (data.volume_6h as number | null) ?? null,
          volume_24h: (data.volume_24h as number | null) ?? null,
        });
      } catch {
        /* noop */
      }
    };
    const id = setInterval(refresh, 8_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [analysis.metadata.ca]);

  const m: LiveMarket = live ?? analysis.market;

  // Pass the current market cap through so the thin-sample threshold can
  // scale: a billion-dollar token with 30 trades/hour is dead; a fresh
  // 200K-cap pump.fun launch with 30 trades/hour is normal flow. Same
  // raw count means very different things at different scales.
  const stats = computeStats(m, tab, analysis.market.market_cap ?? null);

  // Push the latest buy% into the per-tab history buffer. We do this in
  // an effect (not the render path) so the React purity rule is happy and
  // so the buffer doesn't double-push on strict-mode double renders.
  useEffect(() => {
    if (!stats) return;
    const buf = historyRef.current[tab];
    const last = buf[buf.length - 1];
    if (last === stats.buyPct) return; // no new data, skip
    buf.push(stats.buyPct);
    if (buf.length > HISTORY_LIMIT) buf.shift();
    setHistoryTick((t) => t + 1);
  }, [stats?.buyPct, tab]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!stats) {
    return (
      <div className="glass rounded-2xl p-5 sm:p-6 h-full flex flex-col">
        <Header tab={tab} setTab={setTab} hasData={false} />
        <div className="flex-1 flex items-center justify-center text-text-muted text-[12px]">
          No transaction flow reported in this window.
        </div>
      </div>
    );
  }

  return (
    <div className="glass rounded-2xl p-5 sm:p-6 h-full flex flex-col">
      <Header tab={tab} setTab={setTab} hasData />

      <Verdict
        net={stats.net}
        buyPct={stats.buyPct}
        sellPct={stats.sellPct}
        thinSample={stats.thinSample}
        totalTxns={stats.buys + stats.sells}
      />

      <BuyPctTrend history={historyRef.current[tab]} tick={historyTick} />

      <PressureBar
        buyPct={stats.buyPct}
        sellPct={stats.sellPct}
        buyDollars={stats.buyDollars}
        sellDollars={stats.sellDollars}
      />

      {/* Compact stats row instead of two big tiles — saves vertical
          space the user flagged as wasted. Buy count + sell count + the
          implied $ split, all on one line. The "≈" marks make it clear
          the dollar amounts are projected from txn count × volume. */}
      <div className="grid grid-cols-2 gap-3 mt-3 text-[12px]">
        <CompactStat
          label="Buys"
          color="#0a8f57"
          count={stats.buys}
          dollars={stats.buyDollars}
        />
        <CompactStat
          label="Sells"
          color="#c1374a"
          count={stats.sells}
          dollars={stats.sellDollars}
        />
      </div>
    </div>
  );
}

function CompactStat({
  label,
  color,
  count,
  dollars,
}: {
  label: string;
  color: string;
  count: number;
  dollars: number;
}) {
  return (
    <div
      className="flex items-baseline gap-2 rounded-lg px-3 py-2"
      style={{ background: `${color}0F` }}
    >
      <span
        className="text-[9.5px] uppercase tracking-[0.18em] font-bold shrink-0"
        style={{ color }}
      >
        {label}
      </span>
      <span
        className="text-[14px] font-mono font-bold tabular-nums"
        style={{ color }}
      >
        {count.toLocaleString("en-US")}
      </span>
      <span className="text-[10px] text-text-muted text-mono ml-auto">
        ≈ ${humanizeNumber(dollars)}
      </span>
    </div>
  );
}

function Header({
  tab,
  setTab,
  hasData,
}: {
  tab: "5m" | "1h" | "6h" | "24h";
  setTab: (t: "5m" | "1h" | "6h" | "24h") => void;
  hasData: boolean;
}) {
  return (
    <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
      <h3 className="text-[10px] uppercase tracking-[0.2em] text-text-muted font-bold">
        Buy / sell pressure
        {hasData && (
          <span className="ml-2 text-[9px] uppercase tracking-[0.18em] text-text-muted opacity-70">
            live · 8s
          </span>
        )}
      </h3>
      <div className="flex gap-1 rounded-full p-0.5 bg-text-muted/[0.06]">
        {(["5m", "1h", "6h", "24h"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-[0.12em] transition"
            style={{
              background: tab === t ? "var(--text-primary)" : "transparent",
              color:
                tab === t ? "var(--bg-primary)" : "var(--text-muted)",
            }}
          >
            {t}
          </button>
        ))}
      </div>
    </div>
  );
}

function Verdict({
  net,
  buyPct,
  sellPct,
  thinSample,
  totalTxns,
}: {
  net: number;
  buyPct: number;
  sellPct: number;
  thinSample: boolean;
  totalTxns: number;
}) {
  const { text, color } = composeVerdict(
    net,
    buyPct,
    sellPct,
    thinSample,
    totalTxns,
  );
  return (
    <p
      className="text-[13.5px] sm:text-[14.5px] font-semibold leading-snug mb-3"
      style={{ color }}
    >
      {text}
    </p>
  );
}

/**
 * Tiny SVG sparkline of buy% over the rolling history window. Visualizes
 * the *trajectory* of buying pressure, not just the current snap: a
 * 60% buy% reading reads very differently if it's been climbing from 50%
 * (momentum building) vs falling from 80% (top is in).
 *
 * Zero line at 50% (perfectly balanced) is drawn so the user reads
 * "above/below balance" without doing math. Y-axis is locked to 0..100
 * — fixed range matters because we want absolute pressure to read at a
 * glance, not auto-scaled to local extrema.
 */
function BuyPctTrend({
  history,
  tick,
}: {
  history: number[];
  /** Re-renders the spark when new data arrives; the ref array itself
   *  doesn't trigger re-render so we pass a tick counter. */
  tick: number;
}) {
  const path = useMemo(() => {
    if (history.length < 2) return { line: "", area: "" };
    const w = 320;
    const h = 28;
    const x = (i: number) => (i / (history.length - 1)) * w;
    const y = (p: number) => h - (p / 100) * h;
    const line = history
      .map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(2)},${y(p).toFixed(2)}`)
      .join(" ");
    const area = `${line} L${w},${h} L0,${h} Z`;
    return { line, area };
  }, [history, tick]); // eslint-disable-line react-hooks/exhaustive-deps

  if (history.length < 2) {
    return (
      <div className="flex items-center justify-between text-[9.5px] uppercase tracking-[0.18em] text-text-muted font-bold mb-2">
        <span>buy% trend</span>
        <span className="opacity-60 normal-case tracking-normal">
          collecting samples…
        </span>
      </div>
    );
  }

  const last = history[history.length - 1];
  const first = history[0];
  const delta = last - first;
  const direction = delta > 1 ? "climbing" : delta < -1 ? "falling" : "flat";
  const arrow = direction === "climbing" ? "↑" : direction === "falling" ? "↓" : "→";
  const dirColor =
    direction === "climbing"
      ? "#0a8f57"
      : direction === "falling"
        ? "#c1374a"
        : "#5a5a70";

  return (
    <div className="mb-2">
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-[9.5px] uppercase tracking-[0.18em] text-text-muted font-bold">
          buy% trend · last {history.length}
        </span>
        <span
          className="text-[10px] font-bold font-mono tabular-nums"
          style={{ color: dirColor }}
        >
          {arrow} {direction}
        </span>
      </div>
      <svg
        viewBox="0 0 320 28"
        preserveAspectRatio="none"
        className="w-full"
        style={{ display: "block", height: 28 }}
        aria-hidden
      >
        <defs>
          <linearGradient id="bsp-trend-grad" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#14F195" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#14F195" stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* 50% reference line (perfect balance). */}
        <line
          x1="0"
          x2="320"
          y1="14"
          y2="14"
          stroke="currentColor"
          strokeOpacity="0.12"
          strokeDasharray="2 3"
        />
        <path d={path.area} fill="url(#bsp-trend-grad)" />
        <path
          d={path.line}
          fill="none"
          stroke={dirColor}
          strokeWidth={1.4}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Live tip dot at the last sample. */}
        <circle
          cx={320}
          cy={28 - (last / 100) * 28}
          r={2.6}
          fill={dirColor}
        />
      </svg>
    </div>
  );
}

function PressureBar({
  buyPct,
  sellPct,
  buyDollars,
  sellDollars,
}: {
  buyPct: number;
  sellPct: number;
  buyDollars: number;
  sellDollars: number;
}) {
  // Animate the split width when stats change.
  const [renderedBuy, setRenderedBuy] = useState(buyPct);
  useEffect(() => {
    const obj = { v: renderedBuy };
    const a = animate(obj, {
      v: buyPct,
      duration: 700,
      ease: "out(3)",
      onUpdate: () => setRenderedBuy(obj.v),
    });
    return () => {
      a.pause();
    };
  }, [buyPct]);

  return (
    <div>
      <div
        className="relative h-9 rounded-lg overflow-hidden flex"
        style={{
          boxShadow: "inset 0 0 0 1px rgba(10, 10, 30, 0.06)",
        }}
      >
        <div
          className="h-full flex items-center justify-end pr-2.5 text-[11px] font-bold text-mono"
          style={{
            width: `${renderedBuy}%`,
            background:
              "linear-gradient(90deg, rgba(20, 241, 149, 0.15), rgba(20, 241, 149, 0.45))",
            color: "#0a4f2c",
            transition: "background 400ms ease",
          }}
        >
          {renderedBuy >= 14 && `${buyPct.toFixed(0)}%`}
        </div>
        <div
          className="h-full flex items-center justify-start pl-2.5 text-[11px] font-bold text-mono"
          style={{
            width: `${100 - renderedBuy}%`,
            background:
              "linear-gradient(90deg, rgba(255, 45, 156, 0.45), rgba(255, 45, 156, 0.15))",
            color: "#5a1322",
            transition: "background 400ms ease",
          }}
        >
          {100 - renderedBuy >= 14 && `${sellPct.toFixed(0)}%`}
        </div>
      </div>
      <div className="flex items-baseline justify-between text-[10.5px] mt-1.5">
        <span className="text-mono text-text-muted">
          ${humanizeNumber(buyDollars)}{" "}
          <span className="text-[9px] uppercase tracking-[0.14em]">buy</span>
        </span>
        <span className="text-mono text-text-muted">
          <span className="text-[9px] uppercase tracking-[0.14em]">sell</span>{" "}
          ${humanizeNumber(sellDollars)}
        </span>
      </div>
    </div>
  );
}

function computeStats(
  m: LiveMarket,
  tab: "5m" | "1h" | "6h" | "24h",
  marketCap: number | null,
): {
  buys: number;
  sells: number;
  buyDollars: number;
  sellDollars: number;
  buyPct: number;
  sellPct: number;
  net: number;
  totalVolume: number;
  /** True when txn count is too low to draw a real conclusion. */
  thinSample: boolean;
} | null {
  const txns =
    tab === "5m"
      ? m.txns_5m
      : tab === "1h"
        ? m.txns_1h
        : tab === "6h"
          ? m.txns_6h
          : m.txns_24h;
  const volume =
    tab === "5m"
      ? m.volume_5m
      : tab === "1h"
        ? m.volume_1h
        : tab === "6h"
          ? m.volume_6h
          : m.volume_24h;
  if (!txns) return null;
  const total = txns.buys + txns.sells;
  if (total === 0) return null;
  const buyShare = txns.buys / total;
  const buyPct = buyShare * 100;
  const sellPct = 100 - buyPct;
  const vol = volume ?? 0;
  // Dollar split is APPROXIMATE — DexScreener exposes count not amount,
  // so we project: buy$ = volume × (buys / total). Real avg-buy-$ vs
  // avg-sell-$ aren't always equal (whales exit big in single sells,
  // retail buys small repeatedly), but the share is the right shape.
  // This is flagged as "≈" in the UI so users know it's projected.
  const buyDollars = vol * buyShare;
  const sellDollars = vol - buyDollars;
  // Thin-sample threshold: scale by timeframe AND market cap. The
  // baseline assumes a small-cap (~$1M) with active flow. A $1B token
  // has 1000x more eyes and many more bots → expect proportionally more
  // trades before the same %-imbalance is meaningful. Capped at 5x so we
  // don't demand 500 trades on a quiet 1h window for blue chips.
  const base =
    tab === "5m" ? 5 : tab === "1h" ? 20 : tab === "6h" ? 60 : 100;
  const mcap = Math.max(1, marketCap ?? 1_000_000);
  // log-scale multiplier: $1M cap = 1.0x, $10M = 1.5x, $100M = 2.0x,
  // $1B = 2.5x. Clamp to a floor of 0.6x so tiny-cap launches still
  // need a basic minimum count.
  const mcapMult = Math.max(0.6, Math.min(5, 1 + Math.log10(mcap / 1_000_000) * 0.5));
  const thinThreshold = Math.round(base * mcapMult);
  return {
    buys: txns.buys,
    sells: txns.sells,
    buyDollars,
    sellDollars,
    buyPct,
    sellPct,
    net: buyPct - sellPct,
    totalVolume: vol,
    thinSample: total < thinThreshold,
  };
}

function composeVerdict(
  net: number,
  buyPct: number,
  sellPct: number,
  thinSample: boolean,
  totalTxns: number,
): { text: string; color: string } {
  // Thin-sample = too few trades to call it. Don't say "100% selling"
  // when there were 7 sells and 0 buys in a quiet hour, that's just
  // noise. Show the count and let the user decide.
  if (thinSample) {
    return {
      text: `Quiet window. ${totalTxns} txn${totalTxns === 1 ? "" : "s"} this period — too thin to read.`,
      color: "#5a5a70",
    };
  }
  if (net > 30) {
    return {
      text: `Heavy buying. ${buyPct.toFixed(0)}% of trades are buys.`,
      color: "#0a8f57",
    };
  }
  if (net > 10) {
    return {
      text: `Buyers in control. ${buyPct.toFixed(0)}% buys / ${sellPct.toFixed(0)}% sells.`,
      color: "#0a6f47",
    };
  }
  if (net < -30) {
    return {
      text: `Heavy selling. ${sellPct.toFixed(0)}% of trades are sells.`,
      color: "#c1374a",
    };
  }
  if (net < -10) {
    return {
      text: `Sellers in control. ${sellPct.toFixed(0)}% sells / ${buyPct.toFixed(0)}% buys.`,
      color: "#d6601a",
    };
  }
  return {
    text: `Two-sided flow. ${buyPct.toFixed(0)}% / ${sellPct.toFixed(0)}% close to balanced.`,
    color: "#5a5a70",
  };
}
