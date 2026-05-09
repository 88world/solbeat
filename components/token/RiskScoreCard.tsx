"use client";

import { useState } from "react";
import type { RiskScore } from "@/types/token";

export function RiskScoreCard({ risk }: { risk: RiskScore | null }) {
  const [open, setOpen] = useState(false);

  if (!risk) {
    return (
      <div className="glass rounded-2xl p-5 sm:p-6">
        <div className="text-text-secondary text-[13px]">
          Risk scoring unavailable for this token.
        </div>
      </div>
    );
  }

  const labelColor = pickColor(risk.label);
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const dash = (risk.score / 100) * circumference;

  return (
    <button
      type="button"
      onClick={() => setOpen((v) => !v)}
      className="glass rounded-2xl p-5 sm:p-6 w-full text-left hover:border-emphasized transition"
    >
      <div className="flex items-center gap-5">
        <div className="relative shrink-0">
          <svg width="96" height="96" viewBox="0 0 96 96">
            <circle
              cx="48"
              cy="48"
              r={radius}
              fill="none"
              stroke="rgba(255,255,255,0.06)"
              strokeWidth="6"
            />
            <circle
              cx="48"
              cy="48"
              r={radius}
              fill="none"
              stroke={labelColor}
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={`${dash} ${circumference}`}
              transform="rotate(-90 48 48)"
              style={{ filter: `drop-shadow(0 0 6px ${labelColor}66)` }}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-[20px] font-semibold text-mono">{risk.score}</span>
          </div>
        </div>
        <div className="min-w-0">
          <div
            className="text-[10px] uppercase tracking-[0.18em] mb-1"
            style={{ color: labelColor }}
          >
            Risk · {risk.label}
          </div>
          <p className="text-[13px] text-text-primary leading-snug">
            {risk.top_concern}
          </p>
          <div className="text-[10px] text-text-muted mt-1.5">
            {open ? "Hide breakdown" : "Click for breakdown"}
          </div>
        </div>
      </div>

      {open && (
        <div className="mt-5 pt-5 border-t border-subtle grid grid-cols-1 sm:grid-cols-2 gap-3 text-[12px]">
          <FactorBar label="Liquidity" value={risk.factors.liquidity} />
          <FactorBar label="Holder concentration" value={risk.factors.holders} />
          <FactorBar label="Mint / freeze authority" value={risk.factors.authorities} />
          <FactorBar label="Pool age" value={risk.factors.age} />
          <FactorBar label="Volume quality" value={risk.factors.volume_quality} />
        </div>
      )}
    </button>
  );
}

function FactorBar({ label, value }: { label: string; value: number }) {
  const pct = Math.max(0, Math.min(100, value));
  const color =
    pct >= 80 ? "var(--signal-negative)" :
    pct >= 60 ? "var(--signal-warning)" :
    pct >= 40 ? "#c4b400" :
    "var(--signal-positive)";
  return (
    <div>
      <div className="flex justify-between text-[11px] mb-1">
        <span className="text-text-secondary">{label}</span>
        <span className="text-mono text-text-muted">{Math.round(value)}</span>
      </div>
      <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
    </div>
  );
}

function pickColor(label: RiskScore["label"]): string {
  switch (label) {
    case "SAFE": return "#14f195";
    case "LOW": return "#4ade80";
    case "MODERATE": return "#ffa502";
    case "HIGH": return "#ff7846";
    case "EXTREME": return "#ff4757";
    default: return "#a0a0b0";
  }
}
