"use client";

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";

type Props = {
  children: ReactNode;
  className?: string;
  /** Max degrees of rotation. Higher = more dramatic. */
  intensity?: number;
  /** Lerp factor for the smoothing (0..1, lower = smoother lag). */
  smoothing?: number;
  /** Show the moving spotlight/shimmer that follows the cursor. */
  spotlight?: boolean;
  /** Glass-style background, defaults true. Disable if your child supplies its own. */
  glass?: boolean;
  /** Inline style passthrough. */
  style?: CSSProperties;
  /** Optional spotlight tint (rgba). Defaults to brand pink. */
  spotlightColor?: string;
};

/**
 * Cursor-tracked 3D tilt card. Tracks pointer position relative to the
 * card's bounding rect, maps to rotateX/rotateY with a small perspective.
 * Smoothing via rAF lerp so the motion eases instead of snapping.
 *
 * Two simultaneous effects:
 *   1. The card itself tilts (transform: perspective + rotate3d)
 *   2. A spotlight gradient follows the cursor across the card surface
 *      (CSS variables --mx --my drive a radial-gradient overlay)
 *
 * Falls back to no animation under prefers-reduced-motion. Apply this
 * around any glass card to make it feel expensive.
 */
export function TiltCard({
  children,
  className,
  intensity = 6,
  smoothing = 0.12,
  spotlight = true,
  glass = true,
  style,
  spotlightColor = "rgba(255, 45, 156, 0.18)",
}: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;

    const target = { rx: 0, ry: 0, mx: 50, my: 50 };
    const current = { ...target };
    let raf = 0;
    let inside = false;

    const onMove = (e: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width; // 0..1
      const y = (e.clientY - rect.top) / rect.height;
      target.ry = (x - 0.5) * 2 * intensity; // rotateY (left/right)
      target.rx = -(y - 0.5) * 2 * intensity; // rotateX (up/down) inverted feels natural
      target.mx = x * 100;
      target.my = y * 100;
    };
    const onEnter = () => {
      inside = true;
    };
    const onLeave = () => {
      inside = false;
      target.rx = 0;
      target.ry = 0;
    };

    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerenter", onEnter);
    el.addEventListener("pointerleave", onLeave);

    const tick = () => {
      raf = requestAnimationFrame(tick);
      current.rx += (target.rx - current.rx) * smoothing;
      current.ry += (target.ry - current.ry) * smoothing;
      current.mx += (target.mx - current.mx) * smoothing;
      current.my += (target.my - current.my) * smoothing;
      el.style.transform = `perspective(1000px) rotateX(${current.rx.toFixed(2)}deg) rotateY(${current.ry.toFixed(2)}deg) translateZ(0)`;
      el.style.setProperty("--mx", `${current.mx.toFixed(1)}%`);
      el.style.setProperty("--my", `${current.my.toFixed(1)}%`);
      el.style.setProperty("--inside", inside ? "1" : "0");
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerenter", onEnter);
      el.removeEventListener("pointerleave", onLeave);
    };
  }, [intensity, smoothing]);

  return (
    <div
      ref={ref}
      className={
        "relative transition-shadow duration-300 will-change-transform " +
        (glass ? "rounded-2xl " : "") +
        (className ?? "")
      }
      style={{
        background: glass ? "rgba(255, 255, 255, 0.65)" : undefined,
        backdropFilter: glass ? "blur(20px) saturate(160%)" : undefined,
        WebkitBackdropFilter: glass ? "blur(20px) saturate(160%)" : undefined,
        border: glass ? "1px solid rgba(10, 10, 30, 0.06)" : undefined,
        boxShadow: glass ? "0 6px 18px rgba(10, 10, 30, 0.04)" : undefined,
        transformStyle: "preserve-3d",
        ...style,
      }}
    >
      {/* Spotlight overlay — radial gradient at cursor position. The opacity
          is gated by --inside (0 outside the card, 1 inside) so it fades
          when you leave. */}
      {spotlight && (
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none rounded-[inherit]"
          style={{
            background: `radial-gradient(circle 280px at var(--mx, 50%) var(--my, 50%), ${spotlightColor} 0%, transparent 70%)`,
            opacity: "var(--inside, 0)",
            transition: "opacity 300ms ease-out",
            mixBlendMode: "multiply",
          }}
        />
      )}
      {/* Animated gradient border — sweeps a brand gradient around the
          card's edge on hover via mask. Pure CSS, GPU-cheap. */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none rounded-[inherit]"
        style={{
          padding: 1,
          background:
            "conic-gradient(from var(--mx, 0deg) at var(--mx, 50%) var(--my, 50%), rgba(255, 45, 156, 0) 0deg, rgba(255, 45, 156, 0.5) 90deg, rgba(94, 92, 255, 0.5) 180deg, rgba(20, 241, 149, 0.5) 270deg, rgba(255, 45, 156, 0) 360deg)",
          WebkitMask:
            "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
          mask: "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
          WebkitMaskComposite: "xor",
          maskComposite: "exclude",
          opacity: "calc(var(--inside, 0) * 0.85)",
          transition: "opacity 400ms ease-out",
        }}
      />

      <div className="relative" style={{ transform: "translateZ(0)" }}>
        {children}
      </div>
    </div>
  );
}
