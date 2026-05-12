"use client";

import type { ReclaimStatus } from "@/lib/solana/use-reclaim";

/**
 * Color-coded status banner for the reclaim flow. Shared between the
 * HiddenSolHero CTA and the dead-accounts ReclaimPanel button so a click
 * on either surface produces the same loud, color-coded feedback.
 *
 *   info (amber)   — Building / Sign / Submitting
 *   ok   (green)   — Reclaimed N SOL, with Solscan link to first sig
 *   err  (red)     — Build failed, treasury misconfig, wallet error, etc.
 */
export function ReclaimStatusBanner({ status }: { status: ReclaimStatus }) {
  const palette =
    status.kind === "ok"
      ? {
          bg: "rgba(20, 241, 149, 0.10)",
          border: "rgba(20, 241, 149, 0.32)",
          color: "var(--signal-positive)",
        }
      : status.kind === "err"
        ? {
            bg: "rgba(255, 71, 87, 0.10)",
            border: "rgba(255, 71, 87, 0.32)",
            color: "var(--signal-negative)",
          }
        : {
            bg: "rgba(255, 165, 2, 0.10)",
            border: "rgba(255, 165, 2, 0.32)",
            color: "var(--signal-warning)",
          };
  const sig = status.kind === "ok" ? status.sig : undefined;
  return (
    <div
      className="mt-4 rounded-xl px-4 py-3 text-[13px] leading-relaxed"
      style={{
        background: palette.bg,
        border: `1px solid ${palette.border}`,
        color: palette.color,
      }}
      role={status.kind === "err" ? "alert" : "status"}
    >
      <div className="font-bold">{status.text}</div>
      {sig && (
        <a
          href={`https://solscan.io/tx/${sig}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1 inline-block text-[12px] underline opacity-90 hover:opacity-100 text-mono"
        >
          View on Solscan ↗ {sig.slice(0, 8)}…
        </a>
      )}
    </div>
  );
}
