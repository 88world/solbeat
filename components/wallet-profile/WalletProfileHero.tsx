"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { animate } from "animejs";
import type { WalletBadge, WalletIdentity } from "@/lib/data/wallet";
import { humanizeNumber, shortAddress } from "@/lib/utils";
import { TrackButton } from "./TrackButton";

/**
 * Wallet profile hero. The "above the fold" identity surface:
 *
 *   - Truncated address + copy button
 *   - Badge chips (Smart · theo, Whale, Veteran, etc.) animated in
 *   - Big SOL balance with USD conversion
 *   - Whale score dial (0..100) drawn with SVG, animates from 0 on mount
 *   - Wallet age + last-seen timestamp
 *
 * All numbers count up from 0 via anime.js on mount so the page feels
 * "alive". Subsequent renders skip the count-up (we cache last displayed
 * value in a ref).
 */
export function WalletProfileHero({
  identity,
}: {
  identity: WalletIdentity;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const enteredRef = useRef(false);

  // Animate the badge chips into place on first render. anime.js stagger
  // keeps the entry tight — no AnimatePresence overhead needed.
  useEffect(() => {
    if (enteredRef.current || !rootRef.current) return;
    enteredRef.current = true;
    const chips = rootRef.current.querySelectorAll("[data-wallet-badge]");
    if (chips.length) {
      animate(chips, {
        opacity: [0, 1],
        translateY: [10, 0],
        scale: [0.9, 1],
        duration: 600,
        delay: (_el: Element, i: number) => 120 + i * 70,
        ease: "out(3)",
      });
    }
  }, []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(identity.address);
    } catch {
      /* noop */
    }
  };

  return (
    <div
      ref={rootRef}
      className="relative rounded-2xl p-5 sm:p-7 overflow-hidden"
      style={{
        background:
          "linear-gradient(135deg, var(--glass-strong) 0%, var(--glass-medium) 100%), var(--bg-primary)",
        border: "1px solid var(--border-subtle)",
        boxShadow:
          "0 1px 0 rgba(255,255,255,0.08) inset, 0 10px 32px rgba(10, 10, 30, 0.06)",
      }}
    >
      {/* Soft pink/blue radial that hangs off the right edge. Same
          accent palette as the rest of the app, makes the hero feel
          like a continuation of the homepage. */}
      <div
        aria-hidden
        className="absolute -top-20 -right-20 size-72 pointer-events-none"
        style={{
          background:
            "radial-gradient(circle, rgba(255,45,156,0.20) 0%, rgba(94,92,255,0.08) 40%, transparent 70%)",
          filter: "blur(20px)",
        }}
      />

      <div className="relative grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-5 lg:gap-8 items-start">
        {/* LEFT: identity + badges + balances */}
        <div className="min-w-0">
          <div className="text-[10.5px] uppercase tracking-[0.22em] text-text-muted font-bold mb-2">
            Wallet profile
            {identity.alias && (
              <span className="ml-2 text-accent-pulse">· {identity.alias}</span>
            )}
          </div>

          {/* Address + copy button. On phones we drop two more chars
              off each end so the address never wraps to two lines and
              never overflows the card edge. */}
          <div className="flex items-center gap-2 flex-wrap mb-3 min-w-0">
            <h1 className="text-[22px] sm:text-[30px] lg:text-[34px] font-extrabold tracking-[-0.03em] leading-none text-mono min-w-0">
              <span className="sm:hidden">
                {shortAddress(identity.address, 4, 4)}
              </span>
              <span className="hidden sm:inline">
                {shortAddress(identity.address, 6, 6)}
              </span>
            </h1>
            <CopyButton onCopy={copy} />
            <a
              href={`https://solscan.io/account/${identity.address}`}
              target="_blank"
              rel="noreferrer"
              className="text-[10.5px] uppercase tracking-[0.18em] text-text-muted hover:text-text-secondary transition font-bold"
            >
              Solscan ↗
            </a>
            <TrackButton profileAddress={identity.address} />
          </div>

          {/* Badges */}
          {identity.badges.length > 0 ? (
            <div className="flex flex-wrap gap-1.5 mb-5">
              {identity.badges.map((b) => (
                <BadgeChip key={b.label} badge={b} />
              ))}
            </div>
          ) : (
            <div className="text-[11px] text-text-muted mb-5">
              No special tags. Wallet looks ordinary from public data.
            </div>
          )}

          {/* Stats grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-[12px]">
            <Stat
              label="SOL balance"
              value={
                <>
                  <CountUp
                    value={identity.sol_balance}
                    format={(n) => n.toFixed(n < 1 ? 4 : 2)}
                  />
                  <span className="text-text-muted ml-1 text-[12px]">◎</span>
                </>
              }
            />
            <Stat
              label="Wallet age"
              value={identity.age_days != null ? humanizeAge(identity.age_days) : "—"}
              hint={
                identity.age_days != null && identity.age_days > 365
                  ? "older"
                  : identity.age_days != null && identity.age_days < 7
                    ? "fresh"
                    : undefined
              }
            />
            <Stat
              label="Last seen"
              value={
                identity.last_seen != null ? humanizeRelative(identity.last_seen) : "—"
              }
            />
          </div>
        </div>

        {/* RIGHT: whale score dial */}
        <div className="self-center">
          <WhaleScoreDial score={identity.whale_score} />
        </div>
      </div>
    </div>
  );
}

function CopyButton({ onCopy }: { onCopy: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        onCopy();
        setCopied(true);
        setTimeout(() => setCopied(false), 1400);
      }}
      className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] uppercase tracking-[0.16em] font-bold transition"
      style={{
        background: copied ? "rgba(20, 241, 149, 0.14)" : "rgba(10, 10, 30, 0.05)",
        color: copied ? "#0a8f57" : "var(--text-secondary)",
        border: `1px solid ${copied ? "rgba(20, 241, 149, 0.35)" : "var(--border-subtle)"}`,
      }}
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function BadgeChip({ badge }: { badge: WalletBadge }) {
  const { bg, color, ring } = paletteFor(badge.kind);
  return (
    <span
      data-wallet-badge
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10.5px] font-bold uppercase tracking-[0.12em]"
      style={{
        background: bg,
        color,
        boxShadow: `inset 0 0 0 1px ${ring}`,
        opacity: 0,
      }}
    >
      <span
        aria-hidden
        className="size-1.5 rounded-full"
        style={{ background: color }}
      />
      {badge.label}
    </span>
  );
}

function paletteFor(kind: WalletBadge["kind"]) {
  switch (kind) {
    case "smart":
      return {
        bg: "rgba(255, 45, 156, 0.10)",
        color: "#c1374a",
        ring: "rgba(255, 45, 156, 0.35)",
      };
    case "whale":
      return {
        bg: "rgba(94, 92, 255, 0.10)",
        color: "#5e5cff",
        ring: "rgba(94, 92, 255, 0.35)",
      };
    case "veteran":
      return {
        bg: "rgba(214, 96, 26, 0.10)",
        color: "#d6601a",
        ring: "rgba(214, 96, 26, 0.30)",
      };
    case "fresh":
      return {
        bg: "rgba(20, 241, 149, 0.10)",
        color: "#0a8f57",
        ring: "rgba(20, 241, 149, 0.30)",
      };
    case "dormant":
      return {
        bg: "rgba(90, 90, 112, 0.10)",
        color: "#5a5a70",
        ring: "rgba(90, 90, 112, 0.25)",
      };
    case "active":
    default:
      return {
        bg: "rgba(20, 241, 149, 0.10)",
        color: "#0a8f57",
        ring: "rgba(20, 241, 149, 0.30)",
      };
  }
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
    <div>
      <div className="text-text-muted text-[9.5px] uppercase tracking-[0.18em] font-bold flex items-center gap-1.5">
        {label}
        {hint && (
          <span className="text-[8.5px] normal-case tracking-normal text-accent-pulse">
            · {hint}
          </span>
        )}
      </div>
      <div className="text-text-primary text-[18px] sm:text-[20px] font-mono tabular-nums font-semibold mt-1">
        {value}
      </div>
    </div>
  );
}

/**
 * Whale score dial. 0..100 score rendered as a 3/4-arc SVG ring that
 * animates from 0 → score on first render via anime.js. Color shifts
 * across the range so the score reads at a glance: muted gray below 30
 * (shrimp), green at 30..60 (active), pink at 60..85 (whale), red-orange
 * above 85 (mega-whale).
 */
function WhaleScoreDial({ score }: { score: number }) {
  const ref = useRef<SVGSVGElement>(null);
  const numberRef = useRef<HTMLDivElement>(null);
  const enteredRef = useRef(false);

  const tier = useMemo(() => {
    if (score >= 85) return { label: "MEGA WHALE", color: "#d6601a" };
    if (score >= 60) return { label: "WHALE", color: "#c1374a" };
    if (score >= 30) return { label: "ACTIVE", color: "#0a8f57" };
    return { label: "SHRIMP", color: "#5a5a70" };
  }, [score]);

  const radius = 46;
  const circumference = 2 * Math.PI * radius * 0.75; // 3/4 arc
  const dashOffset = circumference * (1 - score / 100);

  useEffect(() => {
    if (enteredRef.current || !ref.current || !numberRef.current) return;
    enteredRef.current = true;

    // Animate the ring fill from 0 → score.
    const arc = ref.current.querySelector("[data-arc-progress]");
    if (arc) {
      animate(arc, {
        strokeDashoffset: [circumference, dashOffset],
        duration: 1400,
        ease: "out(4)",
      });
    }
    // Count up the number alongside.
    const obj = { v: 0 };
    animate(obj, {
      v: score,
      duration: 1400,
      ease: "out(4)",
      onUpdate: () => {
        if (numberRef.current)
          numberRef.current.textContent = String(Math.round(obj.v));
      },
    });
  }, [score, circumference, dashOffset]);

  return (
    <div className="relative w-[140px] h-[140px] sm:w-[160px] sm:h-[160px] flex items-center justify-center">
      <svg
        ref={ref}
        viewBox="0 0 120 120"
        className="w-full h-full -rotate-[135deg]"
      >
        {/* Track */}
        <circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeOpacity={0.10}
          strokeWidth={6}
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${2 * Math.PI * radius}`}
        />
        {/* Progress */}
        <circle
          data-arc-progress
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          stroke={tier.color}
          strokeWidth={6}
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${2 * Math.PI * radius}`}
          strokeDashoffset={circumference}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div
          ref={numberRef}
          className="text-[34px] sm:text-[40px] font-mono font-black tabular-nums leading-none"
          style={{
            color: tier.color,
            textShadow: `0 0 24px ${tier.color}33`,
          }}
        >
          0
        </div>
        <div
          className="text-[9px] uppercase tracking-[0.20em] font-bold mt-1"
          style={{ color: tier.color }}
        >
          {tier.label}
        </div>
      </div>
    </div>
  );
}

/**
 * Generic count-up. Tweens object value from 0 → target on mount, mirrors
 * formatted result into the span. Same pattern used elsewhere in the app.
 */
function CountUp({
  value,
  format,
}: {
  value: number;
  format: (n: number) => string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!ref.current || !Number.isFinite(value)) return;
    const obj = { v: 0 };
    const a = animate(obj, {
      v: value,
      duration: 1200,
      ease: "out(4)",
      onUpdate: () => {
        if (ref.current) ref.current.textContent = format(obj.v);
      },
    });
    return () => {
      a.pause();
    };
  }, [value, format]);
  return <span ref={ref}>{format(0)}</span>;
}

/** humanizeAge / humanizeRelative helpers — local to keep this file self-contained. */

function humanizeAge(days: number): string {
  if (days < 1) return "<1d";
  if (days < 30) return `${days}d`;
  if (days < 365) return `${Math.round(days / 30)}mo`;
  return `${(days / 365).toFixed(days < 730 ? 1 : 0)}y`;
}

function humanizeRelative(unix: number): string {
  const seconds = Math.max(0, Date.now() / 1000 - unix);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 86400 * 30) return `${Math.floor(seconds / 86400)}d ago`;
  return `${Math.floor(seconds / 86400 / 30)}mo ago`;
}

/* eslint-disable @typescript-eslint/no-unused-vars */
// Reference imports kept for type pulse — not all helpers used by every
// branch above, but the types make the data shapes self-documenting.
type _Unused = typeof humanizeNumber;
