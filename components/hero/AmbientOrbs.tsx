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
          left: "-8%",
          top: "-10%",
          width: "55vmin",
          height: "55vmin",
          background:
            "radial-gradient(circle at 30% 30%, rgba(94, 92, 255, 0.22), transparent 60%)",
          filter: "blur(60px)",
          animation: "drift-a 26s ease-in-out infinite",
        }}
      />
      <div
        aria-hidden
        className="absolute pointer-events-none"
        style={{
          right: "-6%",
          bottom: "-12%",
          width: "60vmin",
          height: "60vmin",
          background:
            "radial-gradient(circle at 70% 60%, rgba(255, 45, 156, 0.20), transparent 60%)",
          filter: "blur(60px)",
          animation: "drift-b 30s ease-in-out infinite",
        }}
      />
      <div
        aria-hidden
        className="absolute pointer-events-none"
        style={{
          left: "35%",
          top: "55%",
          width: "40vmin",
          height: "40vmin",
          background:
            "radial-gradient(circle at 50% 50%, rgba(20, 241, 149, 0.10), transparent 60%)",
          filter: "blur(80px)",
          animation: "drift-c 38s ease-in-out infinite",
        }}
      />
    </>
  );
}
