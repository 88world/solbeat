"use client";

/**
 * Three soft, animated radial-gradient orbs that drift across the hero
 * background. Pure CSS — no canvas, no perf cost. They give the page a
 * "living" atmosphere without competing with the sphere.
 */
export function AmbientOrbs() {
  return (
    <>
      <div
        aria-hidden
        className="absolute pointer-events-none"
        style={{
          left: "10%",
          top: "20%",
          width: "44vmin",
          height: "44vmin",
          background:
            "radial-gradient(circle at 30% 30%, rgba(153, 69, 255, 0.18), transparent 60%)",
          filter: "blur(40px)",
          animation: "drift-a 22s ease-in-out infinite",
        }}
      />
      <div
        aria-hidden
        className="absolute pointer-events-none"
        style={{
          right: "8%",
          top: "30%",
          width: "40vmin",
          height: "40vmin",
          background:
            "radial-gradient(circle at 70% 40%, rgba(255, 45, 156, 0.16), transparent 60%)",
          filter: "blur(40px)",
          animation: "drift-b 28s ease-in-out infinite",
        }}
      />
      <div
        aria-hidden
        className="absolute pointer-events-none"
        style={{
          left: "40%",
          bottom: "5%",
          width: "60vmin",
          height: "60vmin",
          background:
            "radial-gradient(circle at 50% 50%, rgba(20, 241, 149, 0.06), transparent 60%)",
          filter: "blur(60px)",
          animation: "drift-c 36s ease-in-out infinite",
        }}
      />
    </>
  );
}
