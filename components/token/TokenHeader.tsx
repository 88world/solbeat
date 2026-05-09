"use client";

import { useState } from "react";
import type { TokenAnalysis } from "@/types/token";
import { shortAddress } from "@/lib/utils";

export function TokenHeader({ analysis }: { analysis: TokenAnalysis }) {
  const { metadata } = analysis;
  const [copied, setCopied] = useState(false);

  const copyCa = async () => {
    try {
      await navigator.clipboard.writeText(metadata.ca);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* noop */
    }
  };

  return (
    <div className="flex items-start gap-4">
      <div className="size-16 sm:size-20 rounded-2xl overflow-hidden glass flex items-center justify-center shrink-0">
        {metadata.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={metadata.image}
            alt={metadata.symbol ?? "token"}
            className="size-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="size-full bg-gradient-to-br from-accent-primary/30 to-accent-pulse/30 flex items-center justify-center text-text-secondary text-xs">
            {metadata.symbol?.slice(0, 3) ?? "—"}
          </div>
        )}
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="text-[28px] sm:text-[36px] font-semibold leading-tight tracking-tight">
            {metadata.name ?? "Unknown token"}
          </h1>
          {metadata.symbol && (
            <span className="text-[14px] text-text-secondary text-mono">
              ${metadata.symbol}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={copyCa}
          className="mt-2 inline-flex items-center gap-2 px-2 py-1 rounded-md text-[11px] text-mono text-text-secondary hover:text-text-primary hover:bg-white/5 transition"
          title="Copy contract address"
        >
          <span>{shortAddress(metadata.ca, 6, 6)}</span>
          <span className="text-text-muted">·</span>
          <span className="text-text-muted">
            {copied ? "Copied" : "Copy"}
          </span>
        </button>
      </div>
    </div>
  );
}
