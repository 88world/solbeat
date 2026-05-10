"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { TrendingToken } from "@/types/token";
import { humanizeNumber, humanizePrice, pctChange, shortAddress } from "@/lib/utils";
import { Sparkline } from "./Sparkline";

type SortKey =
  | "rank"
  | "mcap"
  | "price"
  | "age"
  | "txns"
  | "vol24h"
  | "liq"
  | "p5m"
  | "p1h"
  | "p6h"
  | "p24h";

type SortDir = "asc" | "desc";

const COL_LABEL: Record<SortKey, string> = {
  rank: "#",
  mcap: "MCAP",
  price: "PRICE",
  age: "AGE",
  txns: "TXNS",
  vol24h: "VOLUME",
  liq: "LIQ",
  p5m: "5M",
  p1h: "1H",
  p6h: "6H",
  p24h: "24H",
};

export function TrendingTable({ tokens }: { tokens: TrendingToken[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("vol24h");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // Live polling
  const [live, setLive] = useState(tokens);
  useEffect(() => setLive(tokens), [tokens]);
  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      try {
        const r = await fetch("/api/trending/full", { cache: "no-store" });
        if (!r.ok) return;
        const json = (await r.json()) as { tokens: TrendingToken[] };
        if (!cancelled) setLive(json.tokens);
      } catch {
        /* swallow */
      }
    };
    const id = setInterval(refresh, 15_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const sorted = useMemo(() => {
    const arr = [...live];
    arr.sort((a, b) => {
      const av = sortValue(a, sortKey);
      const bv = sortValue(b, sortKey);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      return sortDir === "desc" ? bv - av : av - bv;
    });
    return arr;
  }, [live, sortKey, sortDir]);

  const setSort = (k: SortKey) => {
    if (k === sortKey) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(k);
      // Default to desc for everything except age
      setSortDir(k === "age" ? "asc" : "desc");
    }
  };

  return (
    <div
      className="w-full rounded-2xl border border-border-subtle overflow-hidden"
      style={{
        background:
          "linear-gradient(180deg, rgba(255, 255, 255, 0.78), rgba(255, 255, 255, 0.55))",
        boxShadow:
          "0 1px 0 rgba(255,255,255,0.7) inset, 0 8px 28px rgba(10, 10, 30, 0.05)",
      }}
    >
      <div className="overflow-x-auto">
        <table className="w-full text-[12px] text-mono">
          <thead>
            <tr className="border-b border-border-subtle">
              {[
                ["rank", "left", "w-12"],
                ["token" as never, "left", "w-[260px]"],
                ["mcap", "right", "w-[100px]"],
                ["price", "right", "w-[110px]"],
                ["age", "left", "w-[60px]"],
                ["txns", "right", "w-[90px]"],
                ["vol24h", "right", "w-[110px]"],
                ["liq", "right", "w-[90px]"],
                ["p5m", "right", "w-[80px]"],
                ["p1h", "right", "w-[80px]"],
                ["p6h", "right", "w-[80px]"],
                ["p24h", "right", "w-[90px]"],
                ["sparkline" as never, "right", "w-[100px]"],
                ["risk" as never, "right", "w-[90px]"],
              ].map(([key, align, width]) => {
                const k = key as SortKey | "token" | "sparkline" | "risk";
                const isSortable = k !== "token" && k !== "sparkline" && k !== "risk";
                const label =
                  k === "token"
                    ? "TOKEN"
                    : k === "sparkline"
                      ? "24H"
                      : k === "risk"
                        ? "RISK"
                        : COL_LABEL[k as SortKey];
                const isActive = isSortable && sortKey === (k as SortKey);
                return (
                  <th
                    key={k}
                    className={`px-3 py-3 text-[9.5px] uppercase tracking-[0.16em] font-bold text-text-muted ${align === "right" ? "text-right" : "text-left"} ${width} ${isSortable ? "cursor-pointer hover:text-text-secondary transition-colors" : ""} ${isActive ? "text-text-primary" : ""}`}
                    onClick={
                      isSortable
                        ? () => setSort(k as SortKey)
                        : undefined
                    }
                  >
                    <span className="inline-flex items-center gap-1">
                      {label}
                      {isActive && (
                        <span className="text-[8px] text-text-muted">
                          {sortDir === "desc" ? "▼" : "▲"}
                        </span>
                      )}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sorted.map((t, i) => (
              <Row key={t.ca} token={t} rank={i + 1} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Row({ token, rank }: { token: TrendingToken; rank: number }) {
  const symbol = (token.symbol ?? "").replace(/^\$/, "").toUpperCase();
  const totalTxns = (token.txns_24h_buys ?? 0) + (token.txns_24h_sells ?? 0);
  const risk = computeRisk(token);

  return (
    <tr
      className="group border-b border-border-subtle/50 hover:bg-text-muted/[0.04] transition-colors"
    >
      <td className="px-3 py-2.5 text-text-muted text-[11px] tabular-nums">
        #{rank}
      </td>

      <td className="px-3 py-2.5">
        <Link
          href={`/token/${token.ca}`}
          className="flex items-center gap-2.5 min-w-0 group/link"
        >
          <Avatar image={token.image} symbol={symbol} />
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-[12.5px] font-bold text-text-primary tracking-tight truncate group-hover/link:text-accent-pulse transition-colors">
                {symbol}
              </span>
              <span className="text-[10px] text-text-muted truncate font-medium">
                {token.name ?? "-"}
              </span>
            </div>
            <span className="text-[9.5px] text-text-muted/70 font-mono">
              {shortAddress(token.ca, 4, 4)}
            </span>
          </div>
        </Link>
      </td>

      <td className="px-3 py-2.5 text-right text-text-primary tabular-nums">
        {token.market_cap != null ? `$${humanizeNumber(token.market_cap)}` : "-"}
      </td>
      <td className="px-3 py-2.5 text-right text-text-primary tabular-nums">
        {humanizePrice(token.price_usd)}
      </td>
      <td className="px-3 py-2.5 text-text-muted text-[11px]">
        {formatAge(token.pair_age_hours)}
      </td>
      <td className="px-3 py-2.5 text-right text-text-secondary tabular-nums">
        {totalTxns > 0 ? humanizeNumber(totalTxns, 0) : "-"}
      </td>
      <td className="px-3 py-2.5 text-right text-text-primary tabular-nums">
        {token.volume_24h != null ? `$${humanizeNumber(token.volume_24h)}` : "-"}
      </td>
      <td className="px-3 py-2.5 text-right text-text-secondary tabular-nums">
        {token.liquidity_usd != null ? `$${humanizeNumber(token.liquidity_usd)}` : "-"}
      </td>

      <PctCell value={token.price_change_5m} />
      <PctCell value={token.price_change_1h} />
      <PctCell value={token.price_change_6h} />
      <PctCell value={token.price_change_24h} bold />

      <td className="px-3 py-2.5 text-right">
        <div className="inline-block">
          <Sparkline
            change24h={token.price_change_24h}
            seed={token.ca}
            width={84}
            height={24}
          />
        </div>
      </td>

      <td className="px-3 py-2.5 text-right">
        <RiskBadge risk={risk} />
      </td>
    </tr>
  );
}

function PctCell({
  value,
  bold = false,
}: {
  value: number | null;
  bold?: boolean;
}) {
  if (value == null) {
    return (
      <td className="px-3 py-2.5 text-right text-text-muted">-</td>
    );
  }
  const positive = value >= 0;
  return (
    <td
      className={`px-3 py-2.5 text-right tabular-nums ${bold ? "font-bold" : "font-semibold"}`}
      style={{ color: positive ? "#0a8f57" : "#c1374a" }}
    >
      {pctChange(value)}
    </td>
  );
}

function Avatar({ image, symbol }: { image: string | null; symbol: string }) {
  if (image) {
    return (
      <span className="size-7 rounded-lg overflow-hidden bg-white shrink-0 border border-border-subtle">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={image}
          alt=""
          className="size-full object-cover"
          referrerPolicy="no-referrer"
          loading="lazy"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = "none";
          }}
        />
      </span>
    );
  }
  return (
    <span
      className="size-7 rounded-lg shrink-0 flex items-center justify-center text-[10px] font-bold text-white"
      style={{
        background:
          "linear-gradient(135deg, #ff2d9c 0%, #5e5cff 60%, #14f195 100%)",
      }}
    >
      {symbol.slice(0, 1)}
    </span>
  );
}

type RiskLevel = "SAFE" | "LOW" | "MED" | "HIGH" | "EXT";

function RiskBadge({ risk }: { risk: RiskLevel }) {
  const styles: Record<RiskLevel, { bg: string; color: string }> = {
    SAFE: { bg: "rgba(20, 241, 149, 0.12)", color: "#0a8f57" },
    LOW:  { bg: "rgba(20, 241, 149, 0.10)", color: "#0a6f47" },
    MED:  { bg: "rgba(163, 104, 10, 0.12)", color: "#a3680a" },
    HIGH: { bg: "rgba(214, 96, 26, 0.12)", color: "#d6601a" },
    EXT:  { bg: "rgba(193, 55, 74, 0.12)", color: "#c1374a" },
  };
  const s = styles[risk];
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-md text-[9.5px] font-bold uppercase tracking-[0.12em]"
      style={{ background: s.bg, color: s.color }}
    >
      {risk}
    </span>
  );
}

function sortValue(token: TrendingToken, key: SortKey): number | null {
  switch (key) {
    case "mcap": return token.market_cap;
    case "price": return token.price_usd;
    case "age":
      // Lower age sorts first when asc → newer first. Use negative so desc/asc
      // both feel correct.
      return token.pair_age_hours;
    case "txns": {
      const t = (token.txns_24h_buys ?? 0) + (token.txns_24h_sells ?? 0);
      return t || null;
    }
    case "vol24h": return token.volume_24h;
    case "liq": return token.liquidity_usd;
    case "p5m": return token.price_change_5m;
    case "p1h": return token.price_change_1h;
    case "p6h": return token.price_change_6h;
    case "p24h": return token.price_change_24h;
    case "rank":
    default:
      return null;
  }
}

function formatAge(hours: number | null): string {
  if (hours == null) return "-";
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  if (hours < 24) return `${Math.round(hours)}h`;
  if (hours < 24 * 30) return `${Math.round(hours / 24)}d`;
  if (hours < 24 * 365) return `${Math.round(hours / 24 / 30)}mo`;
  return `${Math.round(hours / 24 / 365)}y`;
}

/** Heuristic risk derived from the data we already have. */
function computeRisk(t: TrendingToken): RiskLevel {
  const liq = t.liquidity_usd ?? 0;
  const vol = t.volume_24h ?? 0;
  const ageHours = t.pair_age_hours ?? 0;
  const change24 = Math.abs(t.price_change_24h ?? 0);

  let score = 0;
  if (liq < 10_000) score += 40;
  else if (liq < 50_000) score += 25;
  else if (liq < 250_000) score += 10;

  if (ageHours < 24) score += 30;
  else if (ageHours < 168) score += 15;
  else if (ageHours < 720) score += 5;

  // Volume:liquidity ratio, wash trading signal
  const vlr = liq > 0 ? vol / liq : 0;
  if (vlr > 30) score += 25;
  else if (vlr > 15) score += 12;

  // Extreme single-day move, could be pump-and-dump
  if (change24 > 200) score += 15;
  else if (change24 > 80) score += 5;

  if (score >= 70) return "EXT";
  if (score >= 50) return "HIGH";
  if (score >= 30) return "MED";
  if (score >= 15) return "LOW";
  return "SAFE";
}
