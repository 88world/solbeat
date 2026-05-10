"use client";

import { useEffect, useState } from "react";
import { animate } from "animejs";
import type { TokenAnalysis, TokenMarket } from "@/types/token";
import { humanizeNumber } from "@/lib/utils";

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

  const stats = computeStats(m, tab);

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

      <Verdict net={stats.net} buyPct={stats.buyPct} sellPct={stats.sellPct} />

      <PressureBar
        buyPct={stats.buyPct}
        sellPct={stats.sellPct}
        buyDollars={stats.buyDollars}
        sellDollars={stats.sellDollars}
      />

      <div className="grid grid-cols-2 gap-3 mt-4 text-[12px]">
        <SideStats
          label="Buys"
          color="#0a8f57"
          count={stats.buys}
          dollars={stats.buyDollars}
        />
        <SideStats
          label="Sells"
          color="#c1374a"
          count={stats.sells}
          dollars={stats.sellDollars}
        />
      </div>
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
}: {
  net: number;
  buyPct: number;
  sellPct: number;
}) {
  const { text, color } = composeVerdict(net, buyPct, sellPct);
  return (
    <p
      className="text-[14px] sm:text-[15px] font-semibold leading-snug mb-3"
      style={{ color }}
    >
      {text}
    </p>
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

function SideStats({
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
    <div className="rounded-lg px-3 py-2" style={{ background: `${color}0F` }}>
      <div
        className="text-[9.5px] uppercase tracking-[0.18em] font-bold"
        style={{ color }}
      >
        {label}
      </div>
      <div
        className="text-[16px] font-mono font-bold tabular-nums leading-tight mt-0.5"
        style={{ color }}
      >
        {count.toLocaleString("en-US")}
      </div>
      <div className="text-[10.5px] text-text-muted text-mono mt-0.5">
        ${humanizeNumber(dollars)}
      </div>
    </div>
  );
}

function computeStats(
  m: LiveMarket,
  tab: "5m" | "1h" | "6h" | "24h",
): {
  buys: number;
  sells: number;
  buyDollars: number;
  sellDollars: number;
  buyPct: number;
  sellPct: number;
  net: number;
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
  // Dollar split is approximate, DexScreener doesn't expose buy$/sell$ directly.
  const buyDollars = vol * buyShare;
  const sellDollars = vol - buyDollars;
  return {
    buys: txns.buys,
    sells: txns.sells,
    buyDollars,
    sellDollars,
    buyPct,
    sellPct,
    net: buyPct - sellPct,
  };
}

function composeVerdict(
  net: number,
  buyPct: number,
  sellPct: number,
): { text: string; color: string } {
  if (net > 30) {
    return {
      text: `Heavy buying. ${buyPct.toFixed(0)}% of orders are buys.`,
      color: "#0a8f57",
    };
  }
  if (net > 10) {
    return {
      text: `Buyers in control. ${buyPct.toFixed(0)}% buys vs ${sellPct.toFixed(0)}% sells.`,
      color: "#0a6f47",
    };
  }
  if (net < -30) {
    return {
      text: `Heavy selling. ${sellPct.toFixed(0)}% of orders are sells.`,
      color: "#c1374a",
    };
  }
  if (net < -10) {
    return {
      text: `Sellers in control. ${sellPct.toFixed(0)}% sells vs ${buyPct.toFixed(0)}% buys.`,
      color: "#d6601a",
    };
  }
  return {
    text: `Two-sided flow. ${buyPct.toFixed(0)}% / ${sellPct.toFixed(0)}% close to balanced.`,
    color: "#5a5a70",
  };
}
