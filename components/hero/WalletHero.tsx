"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { animate } from "animejs";
import { humanizeNumber, shortAddress } from "@/lib/utils";

type ScanResult = {
  account_count: number;
  total_reclaimable_sol: number;
  user_receives_sol: number;
};

type WalletAnalysis = {
  held: Array<{
    mint: string;
    symbol: string | null;
    name: string | null;
    image: string | null;
    balance: number;
    price_usd: number | null;
    value_usd: number | null;
    price_change_24h: number | null;
  }>;
  empty_account_count: number;
};

/**
 * Wallet hero that lives on the homepage. Two states:
 *
 *   1. Disconnected — slick "Connect to see your hidden SOL" pitch with a
 *      gradient banner. Ambient breathing animation. CTA opens the wallet
 *      modal.
 *
 *   2. Connected — the user's "you have X SOL recoverable" headline plus
 *      a quick portfolio summary (total value, position count, dust
 *      accounts). The recoverable SOL number count-ups via anime.js so
 *      the user can't miss it. Reclaim CTA links to the full wallet page.
 *
 * The selling point: degens have hundreds of dollars of rent locked in
 * dead token accounts. Most don't know it. Surfacing this on the
 * homepage as the centerpiece of the connected experience is the
 * SolBeat differentiator.
 */
export function WalletHero() {
  const { publicKey, connected } = useWallet();
  const { setVisible } = useWalletModal();
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [analysis, setAnalysis] = useState<WalletAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);

  const solRef = useRef<HTMLSpanElement>(null);
  const valueRef = useRef<HTMLSpanElement>(null);
  const lastSolRef = useRef(0);
  const lastValueRef = useRef(0);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!publicKey) {
      setScan(null);
      setAnalysis(null);
      return;
    }
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      const addr = publicKey.toBase58();
      const [scanR, analysisR] = await Promise.all([
        fetch(`/api/reclaim/scan?address=${addr}`).then((r) =>
          r.ok ? r.json() : null,
        ),
        fetch(`/api/wallet/${addr}`).then((r) => (r.ok ? r.json() : null)),
      ]);
      if (cancelled) return;
      if (scanR) setScan(scanR as ScanResult);
      if (analysisR) setAnalysis(analysisR as WalletAnalysis);
      setLoading(false);
    };
    run();
    const id = setInterval(run, 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [publicKey]);

  // Count-up animations on the headline numbers.
  useEffect(() => {
    if (!scan || !solRef.current) return;
    const obj = { v: lastSolRef.current };
    const a = animate(obj, {
      v: scan.user_receives_sol,
      duration: 1600,
      ease: "out(4)",
      onUpdate: () => {
        if (solRef.current) solRef.current.textContent = obj.v.toFixed(4);
        lastSolRef.current = obj.v;
      },
    });
    return () => {
      a.pause();
    };
  }, [scan?.user_receives_sol]);

  useEffect(() => {
    if (!analysis || !valueRef.current) return;
    const total = analysis.held.reduce((s, h) => s + (h.value_usd ?? 0), 0);
    const obj = { v: lastValueRef.current };
    const a = animate(obj, {
      v: total,
      duration: 1400,
      ease: "out(4)",
      onUpdate: () => {
        if (valueRef.current)
          valueRef.current.textContent = `$${humanizeNumber(obj.v)}`;
        lastValueRef.current = obj.v;
      },
    });
    return () => {
      a.pause();
    };
  }, [analysis]);

  // SSR guard.
  if (!mounted) return null;

  if (!connected || !publicKey) {
    return <DisconnectedPitch onConnect={() => setVisible(true)} />;
  }

  return (
    <ConnectedHero
      address={publicKey.toBase58()}
      scan={scan}
      analysis={analysis}
      loading={loading}
      solRef={solRef}
      valueRef={valueRef}
    />
  );
}

function DisconnectedPitch({ onConnect }: { onConnect: () => void }) {
  return (
    <div
      className="rounded-3xl p-6 sm:p-8 relative overflow-hidden mb-8"
      style={{
        background:
          "linear-gradient(135deg, rgba(255, 45, 156, 0.10) 0%, rgba(94, 92, 255, 0.10) 50%, rgba(20, 241, 149, 0.10) 100%)",
        border: "1px solid rgba(94, 92, 255, 0.18)",
      }}
    >
      {/* Drifting gradient orbs */}
      <div
        aria-hidden
        className="absolute -top-24 -right-24 size-72 rounded-full pointer-events-none"
        style={{
          background:
            "radial-gradient(circle, rgba(255, 45, 156, 0.30) 0%, transparent 70%)",
          filter: "blur(40px)",
          animation: "wallet-hero-drift-a 16s ease-in-out infinite",
        }}
      />
      <div
        aria-hidden
        className="absolute -bottom-24 -left-24 size-72 rounded-full pointer-events-none"
        style={{
          background:
            "radial-gradient(circle, rgba(94, 92, 255, 0.30) 0%, transparent 70%)",
          filter: "blur(40px)",
          animation: "wallet-hero-drift-b 22s ease-in-out infinite",
        }}
      />

      <div className="relative flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="flex-1 min-w-0">
          <div className="text-[10.5px] uppercase tracking-[0.22em] font-bold text-text-muted mb-2">
            ✨ Hidden SOL
          </div>
          <h2 className="text-[26px] sm:text-[34px] font-black tracking-[-0.02em] leading-[1.05] text-text-primary mb-2">
            Most degens have <span style={{ color: "#FF2D9C" }}>0.5–3 SOL</span>{" "}
            sitting in dead token accounts.
          </h2>
          <p className="text-[13px] text-text-secondary leading-relaxed max-w-xl">
            Connect your wallet. We&apos;ll scan, show you what&apos;s
            recoverable, then burn the dust accounts back to your wallet in
            one batch.
          </p>
        </div>
        <button
          type="button"
          onClick={onConnect}
          className="shrink-0 inline-flex items-center gap-2 px-6 py-3.5 rounded-full text-[14px] font-bold transition-all hover:scale-[1.03] active:scale-[0.98]"
          style={{
            background: "var(--text-primary)",
            color: "var(--bg-primary)",
            boxShadow:
              "0 10px 28px rgba(10, 10, 30, 0.20), inset 0 1px 0 rgba(255, 255, 255, 0.10)",
          }}
        >
          Connect & scan
          <span aria-hidden className="text-[15px]">
            →
          </span>
        </button>
      </div>

      <style jsx>{`
        @keyframes wallet-hero-drift-a {
          0%, 100% { transform: translate(0, 0); }
          50% { transform: translate(-20px, 10px); }
        }
        @keyframes wallet-hero-drift-b {
          0%, 100% { transform: translate(0, 0); }
          50% { transform: translate(15px, -12px); }
        }
      `}</style>
    </div>
  );
}

function ConnectedHero({
  address,
  scan,
  analysis,
  loading,
  solRef,
  valueRef,
}: {
  address: string;
  scan: ScanResult | null;
  analysis: WalletAnalysis | null;
  loading: boolean;
  solRef: React.RefObject<HTMLSpanElement | null>;
  valueRef: React.RefObject<HTMLSpanElement | null>;
}) {
  const totalValue = analysis
    ? analysis.held.reduce((s, h) => s + (h.value_usd ?? 0), 0)
    : 0;
  const hasReclaimable = scan != null && scan.account_count > 0;
  const top = analysis?.held.slice(0, 4) ?? [];

  return (
    <div
      className="rounded-3xl p-6 sm:p-8 relative overflow-hidden mb-8"
      style={{
        background:
          "linear-gradient(135deg, rgba(20, 241, 149, 0.10) 0%, rgba(255, 139, 45, 0.06) 100%)",
        border: "1px solid rgba(20, 241, 149, 0.20)",
        boxShadow: "0 14px 40px rgba(20, 241, 149, 0.08)",
      }}
    >
      <div
        aria-hidden
        className="absolute -top-20 -right-20 size-64 rounded-full pointer-events-none"
        style={{
          background:
            "radial-gradient(circle, rgba(20, 241, 149, 0.30) 0%, transparent 70%)",
          filter: "blur(36px)",
        }}
      />

      <div className="relative grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-6">
        {/* LEFT: recoverable SOL hero */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[15px]" aria-hidden>
              💰
            </span>
            <span className="text-[10.5px] uppercase tracking-[0.22em] font-bold text-text-secondary">
              Hidden SOL · {shortAddress(address, 4, 4)}
            </span>
          </div>

          {loading && !scan ? (
            <div className="h-[60px] w-2/3 rounded animate-shimmer" />
          ) : hasReclaimable ? (
            <>
              <div className="flex items-baseline gap-3 flex-wrap">
                <span
                  ref={solRef}
                  className="text-[44px] sm:text-[64px] font-black text-mono tabular-nums leading-none tracking-[-0.04em] text-text-primary"
                >
                  {(scan?.user_receives_sol ?? 0).toFixed(4)}
                </span>
                <span className="text-[16px] font-bold text-text-secondary">
                  SOL recoverable
                </span>
              </div>
              <p className="text-[13px] text-text-secondary mt-2.5 leading-relaxed">
                <span className="font-bold text-text-primary text-mono">
                  {scan?.account_count}
                </span>{" "}
                empty token account
                {scan?.account_count === 1 ? "" : "s"} sitting on rent we can
                send back to you.
              </p>
              <Link
                href="/wallet"
                className="mt-5 inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-[13px] font-bold transition-all hover:scale-[1.02] active:scale-[0.98]"
                style={{
                  background: "var(--text-primary)",
                  color: "var(--bg-primary)",
                  boxShadow: "0 6px 18px rgba(10, 10, 30, 0.18)",
                }}
              >
                Reclaim now →
              </Link>
            </>
          ) : (
            <>
              <div className="flex items-baseline gap-2">
                <span
                  className="text-[36px] sm:text-[44px] font-black tracking-[-0.03em] leading-none"
                  style={{ color: "#0a8f57" }}
                >
                  Wallet is clean
                </span>
                <span aria-hidden className="text-[24px]">
                  ✨
                </span>
              </div>
              <p className="text-[13px] text-text-secondary mt-2.5">
                No empty accounts found. No rent stuck. Good hygiene.
              </p>
            </>
          )}
        </div>

        {/* RIGHT: portfolio quick view */}
        <div
          className="rounded-2xl p-4"
          style={{
            background: "var(--glass-medium)",
            backdropFilter: "blur(12px)",
            border: "1px solid rgba(10, 10, 30, 0.06)",
          }}
        >
          <div className="flex items-baseline justify-between mb-2.5">
            <span className="text-[10px] uppercase tracking-[0.22em] font-bold text-text-muted">
              Portfolio
            </span>
            <Link
              href="/wallet"
              className="text-[10px] uppercase tracking-[0.18em] text-text-muted hover:text-text-primary transition font-bold"
            >
              View all →
            </Link>
          </div>
          <div className="flex items-baseline gap-1.5 mb-1">
            <span
              ref={valueRef}
              className="text-[24px] font-black text-mono tabular-nums leading-none tracking-[-0.02em] text-text-primary"
            >
              ${humanizeNumber(totalValue)}
            </span>
          </div>
          <div className="text-[10.5px] text-text-muted mb-3">
            {analysis ? `${analysis.held.length} positions` : "scanning…"}
          </div>
          <ul className="space-y-1">
            {top.map((h) => (
              <li key={h.mint}>
                <Link
                  href={`/token/${h.mint}`}
                  className="flex items-center gap-2 text-[11.5px] hover:bg-text-muted/[0.04] rounded px-1.5 py-1 -mx-1.5 transition"
                >
                  <span className="size-5 rounded shrink-0 overflow-hidden bg-white/40">
                    {h.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={h.image}
                        alt={h.symbol ?? "token"}
                        className="size-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : null}
                  </span>
                  <span className="font-bold text-text-primary truncate flex-1">
                    {h.symbol ?? "Unknown"}
                  </span>
                  <span className="text-mono text-text-muted">
                    {h.value_usd != null
                      ? `$${humanizeNumber(h.value_usd)}`
                      : "—"}
                  </span>
                </Link>
              </li>
            ))}
            {top.length === 0 && analysis && (
              <li className="text-[11px] text-text-muted">
                No positions held.
              </li>
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}
