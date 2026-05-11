"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { animate } from "animejs";
import { humanizeNumber } from "@/lib/utils";

/**
 * Wallet intel panel — the "second brain" view layered above the
 * portfolio grid. Surfaces what only SolBeat tracks across public data:
 *
 *   - Aggregate portfolio risk (USD-weighted, 0..100) drawn as a
 *     half-arc dial
 *   - Recoverable SOL (rent locked in empty token accounts)
 *   - Top 3 flagged positions with the on-chain reason for each flag
 *   - Smart-money overlap: "you hold what {KOL} holds" — the tail-trade
 *     differentiator
 *
 * Fetches from /api/wallet/[address]/intel which is server-cached for
 * 20s. While loading we render a skeleton matching final dimensions so
 * the page doesn't reflow.
 */

type Intel = {
  address: string;
  sol_balance: number;
  total_value_usd: number;
  position_count: number;
  recoverable_sol: number;
  empty_account_count: number;
  aggregate_risk: number;
  verdict: "safe" | "cautious" | "loaded" | "danger";
  top_flagged: Array<{
    mint: string;
    symbol: string | null;
    image: string | null;
    value_usd: number | null;
    risk_score: number;
    reasons: string[];
  }>;
  smart_overlap: Array<{
    kol: string;
    kol_address: string;
    shared: Array<{ mint: string; symbol: string | null }>;
  }>;
};

export function WalletIntelPanel({ address }: { address: string }) {
  const [intel, setIntel] = useState<Intel | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/wallet/${address}/intel`)
      .then((r) => (r.ok ? r.json() : null))
      .then((json: Intel | null) => {
        if (!cancelled && json) setIntel(json);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [address]);

  if (loading || !intel) return <IntelSkeleton />;

  return (
    <div
      className="rounded-2xl p-5 sm:p-6 mb-5"
      style={{
        background:
          "linear-gradient(135deg, var(--glass-strong), var(--glass-medium))",
        border: "1px solid var(--border-subtle)",
        boxShadow:
          "0 1px 0 rgba(255,255,255,0.08) inset, 0 10px 32px rgba(10, 10, 30, 0.05)",
      }}
    >
      <div className="grid grid-cols-1 lg:grid-cols-[auto_1fr] gap-6 items-start">
        {/* LEFT: risk dial + recoverable SOL */}
        <div className="flex flex-col gap-4">
          <RiskDial score={intel.aggregate_risk} verdict={intel.verdict} />
          {intel.recoverable_sol > 0 && (
            <RecoverableCallout
              sol={intel.recoverable_sol}
              count={intel.empty_account_count}
            />
          )}
        </div>

        {/* RIGHT: stats + flagged + overlap */}
        <div className="flex flex-col gap-5 min-w-0">
          {/* Header stats */}
          <div className="grid grid-cols-3 gap-3">
            <Stat
              label="Portfolio value"
              value={`$${humanizeNumber(intel.total_value_usd, 1)}`}
            />
            <Stat
              label="Positions"
              value={`${intel.position_count}`}
              hint={
                intel.empty_account_count > 0
                  ? `+${intel.empty_account_count} closed`
                  : undefined
              }
            />
            <Stat
              label="SOL"
              value={`${intel.sol_balance.toFixed(intel.sol_balance < 1 ? 4 : 2)} ◎`}
            />
          </div>

          {/* Top flagged */}
          <Section title="Top risk flags">
            {intel.top_flagged.length === 0 ? (
              <p className="text-[12px] text-text-muted">
                No high-risk positions detected. Holdings look healthy.
              </p>
            ) : (
              <div className="space-y-2">
                {intel.top_flagged.map((f) => (
                  <FlaggedRow key={f.mint} flagged={f} />
                ))}
              </div>
            )}
          </Section>

          {/* Smart money overlap */}
          <Section
            title="Smart money overlap"
            hint={
              intel.smart_overlap.length > 0
                ? `${intel.smart_overlap.length} match${intel.smart_overlap.length === 1 ? "" : "es"}`
                : undefined
            }
          >
            {intel.smart_overlap.length === 0 ? (
              <p className="text-[12px] text-text-muted">
                None of your positions overlap with the tracked KOL wallets.
                That&apos;s either alpha, or no-one has discovered them yet.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {intel.smart_overlap.slice(0, 6).map((o) => (
                  <OverlapChip key={o.kol_address} overlap={o} />
                ))}
              </div>
            )}
          </Section>
        </div>
      </div>
    </div>
  );
}

/** Half-arc risk dial. Animates from 0 on mount via anime.js. */
function RiskDial({
  score,
  verdict,
}: {
  score: number;
  verdict: Intel["verdict"];
}) {
  const ref = useRef<SVGSVGElement>(null);
  const numRef = useRef<HTMLDivElement>(null);
  const palette =
    verdict === "safe"
      ? { color: "#0a8f57", label: "SAFE" }
      : verdict === "cautious"
        ? { color: "#FFB938", label: "CAUTIOUS" }
        : verdict === "loaded"
          ? { color: "#FF8B2D", label: "LOADED" }
          : { color: "#c1374a", label: "DANGER" };

  const radius = 56;
  // 180° arc (half-circle).
  const arcLength = Math.PI * radius;
  const dashOffset = arcLength * (1 - score / 100);

  useEffect(() => {
    if (!ref.current || !numRef.current) return;
    const arc = ref.current.querySelector("[data-risk-arc]");
    if (arc) {
      animate(arc, {
        strokeDashoffset: [arcLength, dashOffset],
        duration: 1300,
        ease: "out(4)",
      });
    }
    const obj = { v: 0 };
    animate(obj, {
      v: score,
      duration: 1300,
      ease: "out(4)",
      onUpdate: () => {
        if (numRef.current) numRef.current.textContent = String(Math.round(obj.v));
      },
    });
  }, [score, arcLength, dashOffset]);

  return (
    <div className="w-[180px] h-[120px] relative flex flex-col items-center justify-end">
      <svg
        ref={ref}
        viewBox="0 0 140 90"
        className="w-full h-full"
      >
        <path
          d={`M ${70 - radius} 80 A ${radius} ${radius} 0 0 1 ${70 + radius} 80`}
          fill="none"
          stroke="currentColor"
          strokeOpacity={0.10}
          strokeWidth={8}
          strokeLinecap="round"
        />
        <path
          data-risk-arc
          d={`M ${70 - radius} 80 A ${radius} ${radius} 0 0 1 ${70 + radius} 80`}
          fill="none"
          stroke={palette.color}
          strokeWidth={8}
          strokeLinecap="round"
          strokeDasharray={`${arcLength}`}
          strokeDashoffset={arcLength}
          style={{ filter: `drop-shadow(0 0 6px ${palette.color}66)` }}
        />
      </svg>
      <div className="absolute inset-x-0 bottom-0 flex flex-col items-center">
        <div
          ref={numRef}
          className="text-[36px] font-mono font-black tabular-nums leading-none"
          style={{ color: palette.color, textShadow: `0 0 20px ${palette.color}33` }}
        >
          0
        </div>
        <div
          className="text-[9px] uppercase tracking-[0.22em] font-bold mt-0.5"
          style={{ color: palette.color }}
        >
          {palette.label} · RISK
        </div>
      </div>
    </div>
  );
}

function RecoverableCallout({ sol, count }: { sol: number; count: number }) {
  return (
    <div
      className="rounded-xl px-3 py-2.5"
      style={{
        background: "rgba(20, 241, 149, 0.08)",
        boxShadow: "inset 0 0 0 1px rgba(20, 241, 149, 0.30)",
      }}
    >
      <div className="text-[9px] uppercase tracking-[0.20em] font-bold text-[#0a8f57]">
        Recoverable SOL
      </div>
      <div className="font-mono font-bold tabular-nums text-[15px] text-[#0a4f2c] mt-0.5">
        {sol.toFixed(4)} ◎
      </div>
      <div className="text-[10px] text-text-muted mt-0.5">
        Locked in {count} empty account{count === 1 ? "" : "s"}
      </div>
    </div>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <h3 className="text-[10px] uppercase tracking-[0.20em] text-text-muted font-bold">
          {title}
        </h3>
        {hint && (
          <span className="text-[10px] text-text-muted font-mono">{hint}</span>
        )}
      </div>
      {children}
    </div>
  );
}

function FlaggedRow({
  flagged,
}: {
  flagged: Intel["top_flagged"][number];
}) {
  const symbol = (flagged.symbol ?? flagged.mint.slice(0, 4)).toUpperCase();
  const sev =
    flagged.risk_score >= 70
      ? "#c1374a"
      : flagged.risk_score >= 45
        ? "#FF8B2D"
        : "#FFB938";
  return (
    <Link
      href={`/token/${flagged.mint}`}
      className="group relative flex items-center gap-3 px-3 py-2.5 rounded-xl border border-border-subtle hover:border-border-emphasized hover:bg-text-muted/[0.04] transition-all"
    >
      <span
        className="size-9 rounded-lg overflow-hidden shrink-0 flex items-center justify-center"
        style={{
          background: flagged.image
            ? "transparent"
            : "linear-gradient(135deg, #ff2d9c 0%, #5e5cff 60%, #14f195 100%)",
          boxShadow: "inset 0 0 0 1px var(--border-subtle)",
        }}
      >
        {flagged.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={flagged.image}
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
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-bold text-text-primary truncate">
            ${symbol}
          </span>
          <span
            className="text-[9.5px] font-bold uppercase tracking-[0.16em] px-1.5 py-0.5 rounded-md"
            style={{
              background: `${sev}1A`,
              color: sev,
              border: `1px solid ${sev}55`,
            }}
          >
            risk {flagged.risk_score}
          </span>
        </div>
        <div className="text-[11px] text-text-secondary mt-0.5 truncate">
          {flagged.reasons.slice(0, 2).join(" · ")}
        </div>
      </div>
      {flagged.value_usd != null && (
        <div className="text-right shrink-0">
          <div className="text-[12px] font-mono tabular-nums font-bold text-text-primary">
            ${humanizeNumber(flagged.value_usd, 2)}
          </div>
        </div>
      )}
    </Link>
  );
}

function OverlapChip({
  overlap,
}: {
  overlap: Intel["smart_overlap"][number];
}) {
  const symbols = overlap.shared
    .map((s) => s.symbol)
    .filter((s): s is string => !!s)
    .map((s) => s.replace(/^\$/, "").toUpperCase())
    .slice(0, 3);
  const extra = overlap.shared.length - symbols.length;
  return (
    <Link
      href={`/wallet/${overlap.kol_address}`}
      className="group inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold transition"
      style={{
        background: "rgba(255, 45, 156, 0.08)",
        color: "#c1374a",
        boxShadow: "inset 0 0 0 1px rgba(255, 45, 156, 0.35)",
      }}
    >
      <span className="size-1.5 rounded-full bg-accent-pulse" aria-hidden />
      <span className="uppercase tracking-[0.12em]">Smart · {overlap.kol}</span>
      <span className="text-text-muted font-mono normal-case tracking-normal">
        {symbols.length > 0 ? `· $${symbols.join(", $")}` : ""}
        {extra > 0 ? ` +${extra}` : ""}
      </span>
    </Link>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
}) {
  return (
    <div
      className="rounded-xl px-3 py-2.5"
      style={{
        background:
          "linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0))",
        boxShadow: "inset 0 0 0 1px var(--border-subtle)",
      }}
    >
      <div className="text-[9.5px] uppercase tracking-[0.18em] text-text-muted font-bold flex items-center gap-1.5">
        {label}
        {hint && (
          <span className="text-[8.5px] normal-case tracking-normal text-accent-pulse">
            · {hint}
          </span>
        )}
      </div>
      <div className="text-text-primary text-[16px] font-mono tabular-nums font-semibold mt-1">
        {value}
      </div>
    </div>
  );
}

function IntelSkeleton() {
  return (
    <div
      className="rounded-2xl p-5 sm:p-6 mb-5 h-[280px] animate-shimmer"
      style={{
        background: "var(--glass-medium)",
        border: "1px solid var(--border-subtle)",
      }}
    />
  );
}
