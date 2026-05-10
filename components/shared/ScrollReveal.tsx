"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { animate, stagger } from "animejs";

type Props = {
  children: ReactNode;
  className?: string;
  /** Children selector to stagger. Defaults to direct children. */
  childSelector?: string;
  /** How far each child travels in (px). */
  travel?: number;
  /** Per-child stagger delay. */
  step?: number;
  /** Initial delay before the first child fires. */
  startDelay?: number;
  /** Animation duration. */
  duration?: number;
  /** % of element that has to enter the viewport before firing (0..1). */
  threshold?: number;
};

/**
 * IntersectionObserver-driven entrance choreography. Direct children start
 * invisible (opacity:0, translateY:travel). When the wrapper enters the
 * viewport past `threshold`, anime.js stagger-animates them in. Fires once.
 *
 * Lighter than wrapping every section in framer-motion, useful for the
 * homepage's below-the-fold sections so they feel like they're greeting you
 * as you scroll instead of just appearing.
 */
export function ScrollReveal({
  children,
  className,
  childSelector = ":scope > *",
  travel = 24,
  step = 90,
  startDelay = 0,
  duration = 700,
  threshold = 0.18,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const targets = root.querySelectorAll<HTMLElement>(childSelector);
    if (targets.length === 0) return;

    if (reduced) {
      targets.forEach((el) => {
        el.style.opacity = "1";
        el.style.transform = "none";
      });
      return;
    }

    // Pre-set initial state.
    targets.forEach((el) => {
      el.style.opacity = "0";
      el.style.transform = `translateY(${travel}px)`;
      el.style.willChange = "transform, opacity";
    });

    let fired = false;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && !fired) {
            fired = true;
            animate(targets, {
              opacity: [0, 1],
              translateY: [travel, 0],
              duration,
              delay: stagger(step, { start: startDelay }),
              ease: "out(3)",
              onComplete: () => {
                targets.forEach((el) => {
                  el.style.willChange = "";
                });
              },
            });
            io.disconnect();
            break;
          }
        }
      },
      { threshold },
    );
    io.observe(root);
    return () => io.disconnect();
  }, [childSelector, travel, step, startDelay, duration, threshold]);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
