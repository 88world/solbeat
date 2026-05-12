"use client";

import { useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { FEES } from "@/config/constants";
import { useReclaim } from "@/lib/solana/use-reclaim";
import { ReclaimStatusBanner } from "./ReclaimStatusBanner";

type ReclaimAccount = {
  pubkey: string;
  mint: string;
  rent_lamports: number;
  symbol: string | null;
  name: string | null;
  image: string | null;
};

type ScanResult = {
  address: string;
  account_count: number;
  total_reclaimable_sol: number;
  fee_sol: number;
  user_receives_sol: number;
  fee_bps: number;
  accounts: ReclaimAccount[];
};

export function ReclaimPanel() {
  const { publicKey } = useWallet();
  const [data, setData] = useState<ScanResult | null>(null);
  const [loading, setLoading] = useState(false);
  const { status, submitting, reclaim } = useReclaim(data);

  // Detect live-fee mode at mount. The treasury wallet is a NEXT_PUBLIC_*
  // env so it's available client-side; if it's set the build endpoint
  // will route the 5% fee to it. We log once for the demo-recording
  // sanity check ("yes, the fee is going somewhere real").
  useEffect(() => {
    const treasury = process.env.NEXT_PUBLIC_BV_TREASURY_WALLET;
    if (treasury && treasury.length > 0) {
      console.log(
        `[reclaim] live-fee mode — ${FEES.RECLAIM_BPS / 100}% routes to ${treasury.slice(0, 6)}…${treasury.slice(-6)}`,
      );
    } else {
      console.log("[reclaim] demo mode — no fee charged (treasury wallet not set)");
    }
  }, []);

  useEffect(() => {
    if (!publicKey) return;
    let cancelled = false;
    setLoading(true);
    fetch(`/api/reclaim/scan?address=${publicKey.toBase58()}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((json: ScanResult | null) => {
        if (!cancelled) setData(json);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [publicKey]);

  if (!publicKey) {
    return (
      <div className="glass rounded-2xl p-8 text-center">
        <p className="text-text-secondary text-[13px]">
          Connect your wallet to scan for reclaimable SOL.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="glass rounded-2xl p-8 text-center">
        <p className="text-text-muted text-[13px]">Scanning your accounts…</p>
      </div>
    );
  }

  if (!data || data.account_count === 0) {
    return (
      <div className="glass rounded-2xl p-8 text-center">
        <p className="text-text-primary text-[14px] mb-1">
          No dead accounts found.
        </p>
        <p className="text-text-muted text-[12px]">
          You don&apos;t have any empty SPL token accounts. Nothing to reclaim.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="glass rounded-2xl p-6 sm:p-7">
        <div className="text-[10px] uppercase tracking-[0.2em] text-text-muted">
          Hidden SOL
        </div>
        <h2 className="text-[24px] sm:text-[28px] font-semibold mt-2 leading-tight">
          We found {data.account_count} dead account
          {data.account_count === 1 ? "" : "s"} holding{" "}
          <span className="text-accent-pulse text-mono">
            {data.total_reclaimable_sol.toFixed(4)} SOL
          </span>{" "}
          of yours.
        </h2>
        <p className="text-[13px] text-text-secondary mt-3">
          We take {(FEES.RECLAIM_BPS / 100).toFixed(0)}% of what we recover. You
          keep <span className="text-text-primary text-mono">{data.user_receives_sol.toFixed(4)} SOL</span>.
          No fee if you don&apos;t reclaim.
        </p>
        <button
          type="button"
          onClick={reclaim}
          disabled={submitting}
          className="mt-5 h-12 px-6 rounded-full bg-accent-pulse text-black font-medium text-[14px] hover:bg-accent-pulse/90 transition disabled:opacity-60 disabled:cursor-wait"
        >
          {submitting
            ? "Working…"
            : `Reclaim ${data.user_receives_sol.toFixed(4)} SOL`}
        </button>
        {status && <ReclaimStatusBanner status={status} />}
      </div>

      <div className="glass rounded-2xl p-5">
        <h3 className="text-[10px] uppercase tracking-[0.2em] text-text-muted mb-4">
          Dead accounts
        </h3>
        <ul className="space-y-2 max-h-[420px] overflow-y-auto pr-2">
          {data.accounts.map((a) => (
            <li
              key={a.pubkey}
              className="flex items-center gap-3 py-2 border-b border-subtle last:border-0"
            >
              <div className="size-8 rounded-lg bg-white/5 overflow-hidden shrink-0 flex items-center justify-center">
                {a.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={a.image}
                    alt={a.symbol ?? "token"}
                    className="size-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <span className="text-[9px] text-text-muted">
                    {a.symbol?.slice(0, 3) ?? "-"}
                  </span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[13px] truncate">
                  {a.symbol ?? a.name ?? "Unknown token"}
                </div>
                <div className="text-[11px] text-text-muted text-mono truncate">
                  {a.mint.slice(0, 8)}…{a.mint.slice(-6)}
                </div>
              </div>
              <div className="text-mono text-[12px] text-text-secondary">
                {(a.rent_lamports / 1e9).toFixed(4)} SOL
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
