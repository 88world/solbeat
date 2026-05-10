"use client";

import { useEffect, useState } from "react";
import { heatLabel } from "@/lib/utils/heat";

/**
 * Glass pill below the sphere showing live BPM + a contextual heat label.
 *
 * The dot beats via a CSS keyframe whose duration is computed from the BPM,
 * so its visual rhythm matches the WebGL sphere's pulse cadence. Both have
 * been softened from the previous version, the pulse is now a gentle ambient
 * breath rather than a sharp medical-monitor twitch.
 */
export function HeartbeatBadge({ bpm }: { bpm: number }) {
  const [displayBpm, setDisplayBpm] = useState(bpm);

  // Smoothly lerp the displayed number toward the target so spikes feel like
  // the heart actually accelerating, not a state flip.
  useEffect(() => {
    let raf = 0;
    const step = () => {
      setDisplayBpm((v) => {
        const next = v + (bpm - v) * 0.07;
        if (Math.abs(next - bpm) < 0.5) return bpm;
        raf = requestAnimationFrame(step);
        return next;
      });
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [bpm]);

  const periodMs = (60 / Math.max(20, displayBpm)) * 1000;
  const label = heatLabel(displayBpm);
  const heat = Math.max(0, Math.min(1, (displayBpm - 40) / 160)); // 0..1 from 40..200
  const labelColor =
    heat >= 0.75 ? "#c1374a" :   // On fire, red
    heat >= 0.5  ? "#d6601a" :   // Hot, amber-red
    heat >= 0.3  ? "#a3680a" :   // Active, amber
    "#0a8f57";                    // Calm / Steady, green

  return (
    <div
      className="inline-flex items-center gap-2.5 pl-2.5 pr-3 py-1.5 rounded-full border border-border-subtle"
      style={{
        background: "var(--glass-strong)",
        backdropFilter: "blur(16px) saturate(160%)",
        WebkitBackdropFilter: "blur(16px) saturate(160%)",
        boxShadow:
          "0 4px 16px rgba(10, 10, 30, 0.05), inset 0 1px 0 var(--glass-medium)",
      }}
      aria-label={`Solana market heat: ${label} · ${Math.round(displayBpm)} BPM`}
    >
      <span
        className="size-2 rounded-full bg-accent-pulse shrink-0"
        style={{
          animation: `heartbeat-dot ${periodMs}ms ease-in-out infinite`,
          boxShadow: "0 0 6px rgba(255, 45, 156, 0.45)",
        }}
      />
      <span className="text-[11px] font-bold text-text-primary text-mono tabular-nums">
        {Math.round(displayBpm)}
        <span className="text-text-muted font-medium ml-1 tracking-[0.1em]">
          BPM
        </span>
      </span>
      <span className="h-3 w-px bg-border-subtle" aria-hidden />
      <span
        className="text-[10px] font-bold uppercase tracking-[0.16em]"
        style={{ color: labelColor }}
      >
        {label}
      </span>
    </div>
  );
}
