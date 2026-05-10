"use client";

import { useEffect, useRef } from "react";

type Props = {
  /** Base opacity of the whole layer (0..1). */
  opacity?: number;
  /** ClassName for additional positioning. */
  className?: string;
};

/**
 * Slow swirling aurora gradient backdrop. Three large radial blobs in BV
 * brand colors drift independently across the page on a 30-60s loop, fading
 * in/out so the color palette is never the same. Pure CSS keyframes drive
 * the motion, no JS overhead. Below the threshold of conscious motion but
 * the page never feels flat.
 *
 * Sits absolute behind everything (z-0). On light bg with mix-blend-mode
 * multiply it tints the page softly without overwhelming.
 */
export function Aurora({ opacity = 1, className }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }
    // Reduced motion: pause animations on all the blobs.
    rootRef.current?.querySelectorAll<HTMLElement>("[data-aurora-blob]").forEach((el) => {
      el.style.animation = "none";
    });
  }, []);

  return (
    <div
      ref={rootRef}
      aria-hidden
      className={"fixed inset-0 pointer-events-none overflow-hidden z-0 " + (className ?? "")}
      style={{ opacity }}
    >
      <div
        data-aurora-blob
        className="absolute -top-40 -left-40 size-[55vmax] rounded-full"
        style={{
          background:
            "radial-gradient(circle, rgba(255, 45, 156, 0.20) 0%, rgba(255, 45, 156, 0.04) 45%, transparent 70%)",
          filter: "blur(80px)",
          mixBlendMode: "multiply",
          animation: "aurora-drift-a 32s ease-in-out infinite",
        }}
      />
      <div
        data-aurora-blob
        className="absolute -top-32 -right-32 size-[50vmax] rounded-full"
        style={{
          background:
            "radial-gradient(circle, rgba(94, 92, 255, 0.18) 0%, rgba(94, 92, 255, 0.04) 45%, transparent 70%)",
          filter: "blur(80px)",
          mixBlendMode: "multiply",
          animation: "aurora-drift-b 41s ease-in-out infinite",
        }}
      />
      <div
        data-aurora-blob
        className="absolute -bottom-40 left-1/3 size-[60vmax] rounded-full"
        style={{
          background:
            "radial-gradient(circle, rgba(20, 241, 149, 0.14) 0%, rgba(20, 241, 149, 0.03) 45%, transparent 70%)",
          filter: "blur(90px)",
          mixBlendMode: "multiply",
          animation: "aurora-drift-c 53s ease-in-out infinite",
        }}
      />
      <style jsx>{`
        @keyframes aurora-drift-a {
          0%, 100% { transform: translate(0, 0) scale(1); }
          25%      { transform: translate(8vw, 6vh) scale(1.08); }
          50%      { transform: translate(-4vw, 12vh) scale(0.95); }
          75%      { transform: translate(6vw, -4vh) scale(1.05); }
        }
        @keyframes aurora-drift-b {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33%      { transform: translate(-10vw, 8vh) scale(1.10); }
          66%      { transform: translate(6vw, 14vh) scale(0.92); }
        }
        @keyframes aurora-drift-c {
          0%, 100% { transform: translate(0, 0) scale(1); }
          40%      { transform: translate(12vw, -8vh) scale(1.06); }
          70%      { transform: translate(-8vw, 4vh) scale(1.12); }
        }
      `}</style>
    </div>
  );
}
