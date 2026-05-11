"use client";

import { useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { animate, stagger } from "animejs";
import type { WalletHolding } from "@/lib/data/wallet";
import { humanizeNumber } from "@/lib/utils";

/**
 * Holdings list. Token rows sorted by USD value descending, each row links
 * to the token's own profile page so the wallet view is one click away
 * from full token analysis.
 *
 * Per-row visualizations:
 *   - Tiny "share of portfolio" bar at the right edge
 *   - 24h % delta color-coded green / pink
 *   - Token image (DexScreener-supplied) with brand-gradient fallback
 *
 * Rows fade + slide in on mount via anime.js stagger. The full surface
 * loads from /api/wallet/[address] which is already cached/parallelized
 * in lib/data/wallet.ts.
 */
export function WalletHoldings({
  holdings,
}: {
  holdings: WalletHolding[];
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const totalValue = useMemo(
    () => holdings.reduce((acc, h) => acc + (h.value_usd ?? 0), 0),
    [holdings],
  );

  useEffect(() => {
    if (!listRef.current) return;
    const rows = listRef.current.querySelectorAll("[data-holding-row]");
    if (!rows.length) return;
    animate(rows, {
      opacity: [0, 1],
      translateY: [8, 0],
      duration: 520,
      delay: stagger(45, { start: 60 }),
      ease: "out(3)",
    });
  }, [holdings.length]);

  return (
    <div
      className="rounded-2xl p-5 sm:p-6 h-[420px] flex flex-col"
      style={{
        background: "var(--glass-medium)",
        border: "1px solid var(--border-subtle)",
        boxShadow:
          "0 1px 0 rgba(255,255,255,0.08) inset, 0 8px 28px rgba(10, 10, 30, 0.05)",
      }}
    >
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="text-[10px] uppercase tracking-[0.2em] text-text-muted font-bold">
          Token holdings · top {holdings.length}
        </h3>
        <span className="text-[11px] text-text-muted font-mono tabular-nums">
          ${humanizeNumber(totalValue, 1)} total
        </span>
      </div>

      {holdings.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-text-muted text-[13px] px-6 text-center">
          No SPL token holdings. Wallet is SOL-only or all positions have
          closed.
        </div>
      ) : (
        <div
          ref={listRef}
          className="flex-1 min-h-0 overflow-y-auto -mx-1 space-y-1.5 pr-1"
        >
          {holdings.map((h) => (
            <HoldingRow key={h.mint} holding={h} totalValue={totalValue} />
          ))}
        </div>
      )}
    </div>
  );
}

function HoldingRow({
  holding,
  totalValue,
}: {
  holding: WalletHolding;
  totalValue: number;
}) {
  const value = holding.value_usd ?? 0;
  const sharePct = totalValue > 0 ? (value / totalValue) * 100 : 0;
  const symbol = (holding.symbol ?? holding.mint.slice(0, 4)).toUpperCase();
  const change = holding.price_change_24h;
  const positive = (change ?? 0) >= 0;
  return (
    <Link
      data-holding-row
      href={`/token/${holding.mint}`}
      className="group relative flex items-center gap-3 px-3 py-2.5 rounded-xl border border-border-subtle hover:border-border-emphasized hover:bg-text-muted/[0.04] transition-all overflow-hidden"
      style={{
        opacity: 0,
      }}
    >
      {/* Avatar */}
      <span
        className="size-9 rounded-lg overflow-hidden shrink-0 flex items-center justify-center"
        style={{
          background: holding.image
            ? "transparent"
            : "linear-gradient(135deg, #ff2d9c 0%, #5e5cff 60%, #14f195 100%)",
          boxShadow: "inset 0 0 0 1px var(--border-subtle)",
        }}
      >
        {holding.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={holding.image}
            alt={symbol}
            className="size-full object-cover"
            referrerPolicy="no-referrer"
            loading="lazy"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
        ) : (
          <span className="text-[11px] text-white font-bold">
            {symbol.slice(0, 1)}
          </span>
        )}
      </span>

      {/* Symbol + balance */}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-1.5">
          <span className="text-[13px] font-bold text-text-primary truncate tracking-tight">
            ${symbol}
          </span>
          {holding.name && holding.name !== symbol && (
            <span className="text-[10px] text-text-muted truncate">
              {holding.name}
            </span>
          )}
        </div>
        <div className="text-[10.5px] text-text-muted font-mono tabular-nums">
          {humanizeNumber(holding.balance, 2)}{" "}
          {holding.price_usd != null && (
            <span className="opacity-70">
              @ ${formatPrice(holding.price_usd)}
            </span>
          )}
        </div>
      </div>

      {/* USD + 24h */}
      <div className="text-right shrink-0">
        <div className="text-[13px] font-mono tabular-nums font-bold text-text-primary">
          {holding.value_usd != null ? (
            <>${humanizeNumber(value, 2)}</>
          ) : (
            <span className="text-text-muted">—</span>
          )}
        </div>
        {change != null && (
          <div
            className="text-[10.5px] font-mono tabular-nums font-bold"
            style={{ color: positive ? "#0a8f57" : "#c1374a" }}
          >
            {positive ? "+" : ""}
            {change.toFixed(Math.abs(change) >= 100 ? 0 : 2)}%
          </div>
        )}
      </div>

      {/* Share-of-portfolio side stripe */}
      <span
        aria-hidden
        className="absolute right-0 top-0 bottom-0 w-[3px]"
        style={{
          background: "var(--accent-pulse)",
          opacity: Math.min(0.7, 0.15 + (sharePct / 100) * 0.85),
        }}
      />
    </Link>
  );
}

function formatPrice(p: number): string {
  if (p >= 100) return p.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (p >= 1) return p.toFixed(2);
  if (p >= 0.01) return p.toFixed(4);
  return p.toFixed(6);
}
