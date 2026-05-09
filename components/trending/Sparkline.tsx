"use client";

/**
 * Tiny inline sparkline. Synthesizes a 24h trajectory from a 24h % change
 * value (we don't have OHLCV without a paid indexer) and renders an SVG
 * path. Direction-colored. Used inline in leaderboard rows.
 */
export function Sparkline({
  change24h,
  width = 84,
  height = 24,
  seed,
}: {
  change24h: number | null;
  width?: number;
  height?: number;
  /** Used to vary the noise pattern between rows. Pass token CA. */
  seed?: string;
}) {
  if (change24h == null) {
    return <div style={{ width, height }} aria-hidden />;
  }

  const positive = change24h >= 0;
  const color = positive ? "#0a8f57" : "#c1374a";
  const fillColor = positive ? "rgba(20, 241, 149, 0.15)" : "rgba(255, 71, 87, 0.12)";

  const samples = 24;
  const seedNum = seed ? hashString(seed) : 0;

  // Build a smoothstep trajectory from "1" (start) to "1 + change/100" (end),
  // normalize to fit canvas, add small per-row noise.
  const start = 1;
  const end = 1 + change24h / 100;
  const points: { x: number; y: number }[] = [];
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < samples; i++) {
    const t = i / (samples - 1);
    const eased = t * t * (3 - 2 * t);
    const trend = start + (end - start) * eased;
    // Pseudo-random noise per row, deterministic from seed
    const rng = pseudoRand(seedNum + i * 17);
    const noise = (rng - 0.5) * 0.012 * Math.abs(end - start);
    const value = trend + noise;
    if (value < minY) minY = value;
    if (value > maxY) maxY = value;
    points.push({ x: (i / (samples - 1)) * width, y: value });
  }

  const range = Math.max(maxY - minY, Math.abs(start) * 0.001);
  const padY = 2;
  const yToPixel = (y: number) =>
    height - padY - ((y - minY) / range) * (height - padY * 2);

  const linePath = points
    .map((p, i) => {
      const py = yToPixel(p.y);
      if (i === 0) return `M ${p.x.toFixed(2)} ${py.toFixed(2)}`;
      // Smooth via mid-point quadratic
      const prev = points[i - 1];
      const ppy = yToPixel(prev.y);
      const cx = (prev.x + p.x) / 2;
      const cy = (ppy + py) / 2;
      return `Q ${prev.x.toFixed(2)} ${ppy.toFixed(2)}, ${cx.toFixed(2)} ${cy.toFixed(2)} L ${p.x.toFixed(2)} ${py.toFixed(2)}`;
    })
    .join(" ");

  const fillPath = `${linePath} L ${width} ${height} L 0 ${height} Z`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden
      style={{ display: "block" }}
    >
      <path d={fillPath} fill={fillColor} stroke="none" />
      <path
        d={linePath}
        fill="none"
        stroke={color}
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Endpoint dot */}
      <circle
        cx={points[points.length - 1].x}
        cy={yToPixel(points[points.length - 1].y)}
        r="1.6"
        fill={color}
      />
    </svg>
  );
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function pseudoRand(n: number): number {
  // Mulberry32-style cheap noise
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}
