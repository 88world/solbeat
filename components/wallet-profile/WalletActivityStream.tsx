"use client";

import { useEffect, useRef } from "react";
import { animate, stagger } from "animejs";
import type { WalletActivity } from "@/lib/data/wallet";

/**
 * Recent-signatures stream. Newest first, each row links out to Solscan
 * with the txn signature. We deliberately don't decode the txns — that's
 * expensive and the count + timestamp is enough for the "what's this
 * wallet been up to" read. Decoded versions can come from clicking through.
 *
 * Each row's left-edge color encodes confirmed vs error so failed
 * txns visually pop without us having to spell them out.
 */
export function WalletActivityStream({
  activity,
}: {
  activity: WalletActivity;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!listRef.current) return;
    const rows = listRef.current.querySelectorAll("[data-stream-row]");
    if (!rows.length) return;
    animate(rows, {
      opacity: [0, 1],
      translateX: [-6, 0],
      duration: 420,
      delay: stagger(35, { start: 80 }),
      ease: "out(3)",
    });
  }, [activity.recent.length]);

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
          Recent activity
        </h3>
        <span className="text-[10px] text-text-muted font-mono tabular-nums">
          {activity.total_signatures}+ signatures scanned
        </span>
      </div>

      {activity.recent.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-text-muted text-[13px] px-6 text-center">
          No on-chain activity in the scanned window. Wallet may be brand
          new or dormant.
        </div>
      ) : (
        <div
          ref={listRef}
          className="flex-1 min-h-0 overflow-y-auto -mx-1 space-y-1 pr-1"
        >
          {activity.recent.map((sig) => (
            <StreamRow key={sig.signature} sig={sig} />
          ))}
        </div>
      )}
    </div>
  );
}

function StreamRow({
  sig,
}: {
  sig: WalletActivity["recent"][number];
}) {
  const failed = sig.err != null;
  const accent = failed ? "#FF4757" : "#14F195";
  const when = sig.blockTime ? humanizeRelative(sig.blockTime) : "—";
  const sigShort = `${sig.signature.slice(0, 8)}…${sig.signature.slice(-6)}`;
  return (
    <a
      data-stream-row
      href={`https://solscan.io/tx/${sig.signature}`}
      target="_blank"
      rel="noreferrer"
      className="group relative flex items-center justify-between gap-3 px-3 py-2 rounded-lg border border-border-subtle hover:border-border-emphasized hover:bg-text-muted/[0.04] transition-all"
      style={{ opacity: 0 }}
    >
      <span
        aria-hidden
        className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[2px] rounded-r-full"
        style={{ background: accent }}
      />
      <div className="flex items-center gap-2.5 min-w-0 pl-1">
        <span
          className="text-[9px] uppercase tracking-[0.16em] font-bold"
          style={{ color: failed ? "#c1374a" : "#0a8f57" }}
        >
          {failed ? "Failed" : "Confirmed"}
        </span>
        <span className="text-[11px] text-text-muted font-mono tabular-nums truncate">
          {sigShort}
        </span>
      </div>
      <span className="text-[10px] text-text-muted font-mono tabular-nums shrink-0">
        {when}
      </span>
    </a>
  );
}

function humanizeRelative(unix: number): string {
  const seconds = Math.max(0, Date.now() / 1000 - unix);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 86400 * 30) return `${Math.floor(seconds / 86400)}d ago`;
  return `${Math.floor(seconds / 86400 / 30)}mo ago`;
}
