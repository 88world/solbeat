"use client";

import { useEffect, useRef, useState } from "react";
import { animate } from "animejs";

type ScanResult = {
  address: string;
  account_count: number;
  total_reclaimable_sol: number;
  fee_sol: number;
  user_receives_sol: number;
  fee_bps: number;
};

/**
 * Hidden SOL hero. Gemini's audit flagged that the reclaim/incineration
 * feature was buried behind a tab when it should be the loudest thing on
 * the wallet page — recoverable SOL is often a bigger number than the
 * user's actual portfolio value (the screenshot showed a $0.0002 wallet
 * with 1 dust account = ~$0.20 of recoverable rent).
 *
 * Solution: prominent gradient banner at the very top of the wallet page
 * the moment a scan returns >0 reclaimable SOL. Massive number, count of
 * dead accounts, one-click jump to the Hidden SOL tab. anime.js drives
 * the count-up so the user can't miss the reveal.
 */
export function HiddenSolHero({
  address,
  onJump,
}: {
  address: string;
  /** Called when the user clicks the CTA. Parent should switch to the reclaim tab. */
  onJump: () => void;
}) {
  const [scan, setScan] = useState<ScanResult | null>(null);
  const numberRef = useRef<HTMLSpanElement>(null);
  const lastDisplayedRef = useRef(0);

  useEffect(() => {
    if (!address) return;
    let cancelled = false;
    const fetchScan = async () => {
      try {
        const r = await fetch(`/api/reclaim/scan?address=${address}`, {
          cache: "no-store",
        });
        if (!r.ok) return;
        const data = (await r.json()) as ScanResult;
        if (!cancelled) setScan(data);
      } catch {
        /* noop */
      }
    };
    fetchScan();
    // Re-poll every 60s; reclaim scan is heavy so don't hammer.
    const id = setInterval(fetchScan, 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [address]);

  // Count-up animation on the SOL number.
  useEffect(() => {
    if (!scan || !numberRef.current) return;
    const target = scan.user_receives_sol;
    const obj = { v: lastDisplayedRef.current };
    const a = animate(obj, {
      v: target,
      duration: 1400,
      ease: "out(4)",
      onUpdate: () => {
        if (numberRef.current) {
          numberRef.current.textContent = obj.v.toFixed(4);
        }
        lastDisplayedRef.current = obj.v;
      },
    });
    return () => {
      a.pause();
    };
  }, [scan?.user_receives_sol]);

  // Don't render until we know there's something worth showing.
  if (!scan) {
    return (
      <div
        className="rounded-2xl px-5 py-4 mb-6 flex items-center justify-between gap-4"
        style={{
          background: "rgba(10, 10, 30, 0.04)",
          border: "1px solid rgba(10, 10, 30, 0.06)",
        }}
      >
        <span className="text-[12px] text-text-muted">
          Scanning for reclaimable rent…
        </span>
      </div>
    );
  }

  if (scan.account_count === 0) {
    return (
      <div
        className="rounded-2xl px-5 py-4 mb-6 flex items-center justify-between gap-4"
        style={{
          background: "rgba(20, 241, 149, 0.06)",
          border: "1px solid rgba(20, 241, 149, 0.16)",
        }}
      >
        <div className="flex items-center gap-3">
          <span aria-hidden className="text-[18px]">
            ✨
          </span>
          <div>
            <div className="text-[12.5px] font-bold text-text-primary">
              Wallet is clean.
            </div>
            <div className="text-[11px] text-text-muted mt-0.5">
              No empty accounts found. Nothing to reclaim.
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="relative overflow-hidden rounded-3xl mb-6 group"
      style={{
        background:
          "linear-gradient(135deg, rgba(255, 45, 156, 0.16) 0%, rgba(255, 139, 45, 0.10) 50%, rgba(20, 241, 149, 0.10) 100%)",
        border: "1px solid rgba(255, 139, 45, 0.20)",
        boxShadow: "0 12px 40px rgba(255, 139, 45, 0.12)",
      }}
    >
      {/* Drifting gradient blob */}
      <div
        aria-hidden
        className="absolute -top-16 -right-16 size-64 rounded-full pointer-events-none"
        style={{
          background:
            "radial-gradient(circle, rgba(255, 45, 156, 0.30) 0%, transparent 70%)",
          filter: "blur(28px)",
        }}
      />

      <div className="relative flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5 p-6">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <span aria-hidden className="text-[15px]">
              💰
            </span>
            <span className="text-[10.5px] uppercase tracking-[0.20em] font-bold text-text-secondary">
              Hidden SOL · scanned
            </span>
          </div>
          <div className="flex items-baseline gap-3 flex-wrap">
            <span
              ref={numberRef}
              className="text-[40px] sm:text-[52px] font-black text-mono tabular-nums leading-none tracking-tight"
              style={{ color: "var(--text-primary)" }}
            >
              {scan.user_receives_sol.toFixed(4)}
            </span>
            <span className="text-[14px] font-bold text-text-secondary">
              SOL recoverable
            </span>
          </div>
          <div className="text-[12.5px] text-text-secondary mt-2 leading-relaxed">
            <span className="font-bold text-text-primary text-mono">
              {scan.account_count}
            </span>{" "}
            empty token account{scan.account_count === 1 ? "" : "s"} sitting
            on rent that's yours to take back. We clip{" "}
            {(scan.fee_bps / 100).toFixed(0)}% only if you reclaim.
          </div>
        </div>

        <button
          type="button"
          onClick={onJump}
          className="shrink-0 inline-flex items-center gap-2 px-6 py-3 rounded-full text-[13.5px] font-bold transition-all hover:scale-[1.02] active:scale-[0.98]"
          style={{
            background: "var(--text-primary)",
            color: "var(--bg-primary)",
            boxShadow:
              "0 8px 22px rgba(10, 10, 30, 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.10)",
          }}
        >
          Reclaim now
          <span aria-hidden className="text-[14px]">
            →
          </span>
        </button>
      </div>
    </div>
  );
}
