"use client";

/**
 * Soft, slow-drifting radial-gradient blobs that give the hero "weather"
 * without competing with the sphere. Pure CSS — no canvas. Works on either
 * theme; the blob colors are brand-tinted, the bg behind them carries the
 * theme.
 */
export function AmbientOrbs() {
  return (
    <>
      <div
        aria-hidden
        className="absolute pointer-events-none"
        style={{
          left: "-12%",
          top: "-12%",
          width: "55vmin",
          height: "55vmin",
          background:
            "radial-gradient(circle at 30% 30%, rgba(94, 92, 255, 0.10), transparent 65%)",
          filter: "blur(80px)",
          animation: "drift-a 26s ease-in-out infinite",
        }}
      />
      <div
        aria-hidden
        className="absolute pointer-events-none"
        style={{
          right: "-10%",
          bottom: "-14%",
          width: "60vmin",
          height: "60vmin",
          background:
            "radial-gradient(circle at 70% 60%, rgba(255, 45, 156, 0.10), transparent 65%)",
          filter: "blur(80px)",
          animation: "drift-b 30s ease-in-out infinite",
        }}
      />
    </>
  );
}
