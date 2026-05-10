"use client";

import { useEffect, useRef } from "react";

type Props = {
  /** Diameter in px. */
  size?: number;
  /** Lerp factor per frame (0..1). Lower = smoother lag. */
  follow?: number;
  /** Class on the wrapper for blend-mode/z-index/etc. tuning per page. */
  className?: string;
  /** CSS background. Defaults to a brand pink-purple-green tri-gradient. */
  background?: string;
  /** CSS blur radius. */
  blur?: number;
};

/**
 * Cursor-following ambient gradient orb. Sits behind the content with a
 * heavy blur so it reads as atmosphere rather than a thing on the page,
 * gives every hover a subtle "you're being followed" warmth that you
 * don't consciously notice but absolutely feel. Linear/Vercel/Stripe
 * marketing pages all do some flavor of this.
 *
 * Implementation:
 *   - Track target (cursor) + current (smoothed) positions in refs.
 *   - rAF lerps current toward target every frame, transform is set
 *     directly on the element, no React re-render at 60fps.
 *   - Initial position centers on the viewport so first paint isn't a
 *     blob in the corner.
 *   - Pauses (bookmarks position) when the tab is hidden.
 */
export function CursorBlob({
  size = 720,
  follow = 0.08,
  className,
  background,
  blur = 100,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const target = { x: window.innerWidth / 2, y: window.innerHeight / 3 };
    const current = { ...target };
    let raf = 0;
    let visible = true;

    const onMove = (e: MouseEvent) => {
      target.x = e.clientX;
      target.y = e.clientY;
    };
    const onTouch = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;
      target.x = t.clientX;
      target.y = t.clientY;
    };
    const onVis = () => {
      visible = !document.hidden;
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("touchmove", onTouch, { passive: true });
    document.addEventListener("visibilitychange", onVis);

    const tick = () => {
      raf = requestAnimationFrame(tick);
      if (!visible) return;
      current.x += (target.x - current.x) * follow;
      current.y += (target.y - current.y) * follow;
      const el = ref.current;
      if (el) {
        el.style.transform = `translate3d(${(current.x - size / 2).toFixed(1)}px, ${(current.y - size / 2).toFixed(1)}px, 0)`;
      }
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("touchmove", onTouch);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [follow, size]);

  return (
    <div
      ref={ref}
      aria-hidden
      className={
        "fixed top-0 left-0 pointer-events-none z-0 " + (className ?? "")
      }
      style={{
        width: size,
        height: size,
        background:
          background ??
          "radial-gradient(circle, rgba(255, 45, 156, 0.18) 0%, rgba(94, 92, 255, 0.14) 35%, rgba(20, 241, 149, 0.08) 60%, transparent 75%)",
        filter: `blur(${blur}px)`,
        willChange: "transform",
        mixBlendMode: "multiply",
      }}
    />
  );
}
