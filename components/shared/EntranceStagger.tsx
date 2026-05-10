"use client";

import { useEffect, useRef } from "react";
import { animate, stagger } from "animejs";

type Props = {
  children: React.ReactNode;
  /** Per-child stagger delay in ms. */
  step?: number;
  /** Initial delay before the first child animates. */
  startDelay?: number;
  /** Animation duration. */
  duration?: number;
  /** How far each child travels (px). */
  travel?: number;
  /** ClassName for the wrapper. */
  className?: string;
};

/**
 * Wraps a list of sibling elements in a stagger entrance animation. Each
 * direct child fades + lifts in sequence. Uses anime.js + stagger() so
 * easing is consistent with the rest of the app's choreography.
 *
 * Children start invisible (opacity: 0 inline) so there's no flash before
 * the effect fires. We only animate ONCE on mount; if more children get
 * appended later (Suspense boundaries resolving), they need their own
 * entrance.
 */
export function EntranceStagger({
  children,
  step = 80,
  startDelay = 100,
  duration = 700,
  travel = 14,
  className,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      // Just snap visible on reduced-motion.
      ref.current.querySelectorAll<HTMLElement>("[data-stagger-child]").forEach((el) => {
        el.style.opacity = "1";
        el.style.transform = "none";
      });
      return;
    }
    const els = ref.current.querySelectorAll("[data-stagger-child]");
    if (els.length === 0) return;
    animate(els, {
      opacity: [0, 1],
      translateY: [travel, 0],
      duration,
      delay: stagger(step, { start: startDelay }),
      ease: "out(3)",
    });
  }, [step, startDelay, duration, travel]);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
