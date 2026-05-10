"use client";

import dynamic from "next/dynamic";

/**
 * Thin client wrapper that code-splits CandlestickChart (and the
 * ~150KB lightweight-charts dependency) out of the token page's
 * initial JS bundle. Next disallows `ssr: false` directly inside
 * server components, so this lives in its own client file.
 *
 * The loading state mirrors the chart's outer dimensions so the
 * page doesn't reflow when the chunk arrives.
 */
const CandlestickChart = dynamic(
  () =>
    import("./CandlestickChart").then((m) => m.CandlestickChart),
  {
    ssr: false,
    loading: () => (
      <div
        className="glass rounded-2xl p-5 sm:p-6"
        style={{ minHeight: 380 }}
      />
    ),
  },
);

export function CandlestickChartLazy({ ca }: { ca: string }) {
  return <CandlestickChart ca={ca} />;
}
