"use client";

import { useEffect, useState } from "react";

/**
 * Glass pill below/beside the sphere showing the live BPM. The dot beats with
 * a CSS keyframe whose duration is derived from the BPM, so the visual rhythm
 * matches the WebGL sphere's pulse.
 */
export function HeartbeatBadge({ bpm }: { bpm: number }) {
  const [displayBpm, setDisplayBpm] = useState(bpm);

  // Smoothly lerp the displayed number toward the target so spikes (50→160)
  // feel like the heart actually accelerating, not a state flip.
  useEffect(() => {
    let raf = 0;
    const step = () => {
      setDisplayBpm((v) => {
        const next = v + (bpm - v) * 0.08;
        if (Math.abs(next - bpm) < 0.5) return bpm;
        raf = requestAnimationFrame(step);
        return next;
      });
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [bpm]);

  // Period in seconds → ms for the CSS animation
  const periodMs = (60 / Math.max(20, displayBpm)) * 1000;

  return (
    <div
      className="inline-flex items-center gap-2.5 pl-2.5 pr-3.5 py-1.5 rounded-full border border-border-subtle"
      style={{
        background: "rgba(255, 255, 255, 0.7)",
        backdropFilter: "blur(16px) saturate(160%)",
        WebkitBackdropFilter: "blur(16px) saturate(160%)",
        boxShadow:
          "0 4px 16px rgba(10, 10, 30, 0.05), inset 0 1px 0 rgba(255, 255, 255, 0.6)",
      }}
      aria-label={`Heart rate ${Math.round(displayBpm)} BPM`}
    >
      <span
        className="size-2 rounded-full bg-accent-pulse shrink-0"
        style={{
          animation: `heartbeat-dot ${periodMs}ms ease-in-out infinite`,
          boxShadow: "0 0 8px rgba(255, 45, 156, 0.6)",
        }}
      />
      <span className="text-[11px] font-bold text-text-primary text-mono tabular-nums">
        {Math.round(displayBpm)}
        <span className="text-text-muted font-medium ml-1 tracking-[0.1em]">BPM</span>
      </span>
    </div>
  );
}
