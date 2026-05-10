"use client";

import { useState } from "react";
import type { TokenHolders } from "@/types/token";
import { shortAddress } from "@/lib/utils";

/**
 * Top holders list. Shows top 10 by default; "Show all 20" expands to the
 * full set. Three reviewers said the token page scrolled forever — this is
 * one of the longest panels, and 95% of users only care about the top 10
 * concentration. Keeping the data accessible (one click) without making it
 * the headline.
 */
export function HolderList({
  holders,
  ca,
}: {
  holders: TokenHolders;
  /** Optional — when provided, the empty state shows a Solscan deep link. */
  ca?: string;
}) {
  const [expanded, setExpanded] = useState(false);

  if (holders.top_20.length === 0) {
    return (
      <div className="glass rounded-2xl p-5 sm:p-6">
        <div className="flex items-baseline justify-between mb-3">
          <h3 className="text-[10px] uppercase tracking-[0.2em] text-text-muted font-bold">
            Top holders
          </h3>
        </div>
        <p className="text-[13px] text-text-secondary leading-relaxed">
          Top-holder breakdown isn&apos;t available in this view.
        </p>
        {ca && (
          <a
            href={`https://solscan.io/token/${ca}#holders`}
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-flex items-center gap-1.5 px-3 h-8 rounded-full text-[11.5px] font-semibold border border-border-subtle hover:border-border-emphasized text-text-primary transition"
          >
            View top holders on Solscan
            <span className="text-text-muted text-[9px]" aria-hidden>↗</span>
          </a>
        )}
      </div>
    );
  }

  const max = holders.top_20[0]?.pct ?? 1;
  const visible = expanded ? holders.top_20 : holders.top_20.slice(0, 10);
  const hasMore = holders.top_20.length > 10;

  return (
    <div className="glass rounded-2xl p-5 sm:p-6">
      <div className="flex items-baseline justify-between mb-4">
        <h3 className="text-[10px] uppercase tracking-[0.2em] text-text-muted font-bold">
          {expanded ? "Top 20 holders" : "Top 10 holders"}
        </h3>
        {holders.top_10_pct != null && (
          <span className="text-[11px] text-text-muted">
            Top 10 hold {holders.top_10_pct.toFixed(1)}%
          </span>
        )}
      </div>
      <ul className="space-y-1.5">
        {visible.map((h, i) => {
          const w = Math.min(100, (h.pct / max) * 100);
          return (
            <li key={h.address} className="flex items-center gap-3 text-[12px]">
              <span className="text-text-muted text-mono w-5 text-right">
                {String(i + 1).padStart(2, "0")}
              </span>
              <a
                href={`https://solscan.io/account/${h.address}`}
                target="_blank"
                rel="noreferrer"
                className="text-mono text-text-secondary hover:text-text-primary transition w-[112px] shrink-0"
              >
                {shortAddress(h.address, 4, 4)}
              </a>
              <div className="flex-1 h-1.5 bg-text-muted/15 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-accent-primary to-accent-pulse"
                  style={{ width: `${w}%` }}
                />
              </div>
              <span className="text-mono text-text-secondary w-14 text-right">
                {h.pct.toFixed(2)}%
              </span>
            </li>
          );
        })}
      </ul>

      {hasMore && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-4 inline-flex items-center gap-1.5 text-[11px] text-text-muted hover:text-text-secondary transition font-semibold uppercase tracking-[0.15em]"
        >
          {expanded ? "Show top 10 only" : `Show all ${holders.top_20.length}`}
          <span aria-hidden className="text-[8px]">
            {expanded ? "▲" : "▼"}
          </span>
        </button>
      )}
    </div>
  );
}
