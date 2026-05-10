"use client";

import Link from "next/link";
import { humanizeNumber, pctChange } from "@/lib/utils";

export type HeldToken = {
  mint: string;
  symbol: string | null;
  name: string | null;
  image: string | null;
  balance: number;
  price_usd: number | null;
  value_usd: number | null;
  price_change_24h: number | null;
};

export function PortfolioGrid({ held }: { held: HeldToken[] }) {
  if (held.length === 0) {
    return (
      <div className="glass rounded-2xl p-8 text-center">
        <p className="text-text-secondary text-[13px]">
          No tokens with non-zero balance found in this wallet.
        </p>
      </div>
    );
  }

  const totalValue = held.reduce((s, h) => s + (h.value_usd ?? 0), 0);

  return (
    <div className="space-y-4">
      <div className="glass rounded-2xl p-5 sm:p-6">
        <div className="text-[10px] uppercase tracking-[0.2em] text-text-muted">
          Portfolio value · approx
        </div>
        <div className="text-[36px] sm:text-[44px] leading-none font-semibold text-mono mt-2">
          ${humanizeNumber(totalValue)}
        </div>
        <div className="text-[12px] text-text-muted mt-1">
          {held.length} token{held.length === 1 ? "" : "s"} with positions
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {held.map((h) => (
          <Link
            key={h.mint}
            href={`/token/${h.mint}`}
            className="glass rounded-2xl p-4 hover:border-emphasized transition flex items-center gap-3"
          >
            <div className="size-10 rounded-xl overflow-hidden bg-white/5 shrink-0 flex items-center justify-center">
              {h.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={h.image}
                  alt={h.symbol ?? "token"}
                  className="size-full object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <span className="text-[10px] text-text-muted">
                  {h.symbol?.slice(0, 3) ?? "-"}
                </span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <div className="font-medium text-[13px] truncate">
                  {h.symbol ?? "Unknown"}
                </div>
                <div className="text-mono text-[12px] text-text-secondary">
                  {h.value_usd != null ? `$${humanizeNumber(h.value_usd)}` : "-"}
                </div>
              </div>
              <div className="flex items-center justify-between gap-2 text-[11px] text-text-muted mt-0.5">
                <span className="text-mono">
                  {humanizeNumber(h.balance, 4)} {h.symbol}
                </span>
                <span
                  className={
                    (h.price_change_24h ?? 0) >= 0
                      ? "text-signal-positive"
                      : "text-signal-negative"
                  }
                >
                  {h.price_change_24h != null ? pctChange(h.price_change_24h) : ""}
                </span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
