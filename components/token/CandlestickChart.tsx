"use client";

import { useEffect, useRef, useState } from "react";
import { createChart, CandlestickSeries, HistogramSeries } from "lightweight-charts";
import type { IChartApi, ISeriesApi, Time } from "lightweight-charts";
import type { CandleBar, Timeframe } from "@/lib/data/geckoterminal";

type Props = {
  ca: string;
};

/**
 * Real candlestick chart powered by TradingView's lightweight-charts. This
 * was the single biggest gap vs Photon / DexScreener — degens won't trust
 * any analytics product without a chart they can scan in 2 seconds.
 *
 * Data path: poll /api/token/[ca]/ohlcv every 60s. Server resolves the
 * most-active pool (same logic as buy/sell pressure so the chart matches
 * the pressure card) and pulls OHLCV from GeckoTerminal's free public API.
 *
 * Visual choices that match the rest of the app:
 *   - Brand pink/green for up/down candles (same as TickerTape, Movers).
 *   - Histogram volume in muted brand-pink along the bottom.
 *   - Crosshair instead of magnetic so degens can read precise prices.
 *   - No watermark, no axis label clutter, transparent bg so the page's
 *     glass treatment shows through.
 */
export function CandlestickChart({ ca }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const [tf, setTf] = useState<Timeframe>("15m");
  const [bars, setBars] = useState<CandleBar[]>([]);
  const [loading, setLoading] = useState(true);
  const [pool, setPool] = useState<string | null>(null);

  // Mount the chart once.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { color: "transparent" },
        textColor: "var(--text-secondary)",
        fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
      },
      grid: {
        vertLines: { color: "rgba(10, 10, 30, 0.04)" },
        horzLines: { color: "rgba(10, 10, 30, 0.04)" },
      },
      rightPriceScale: { borderColor: "rgba(10, 10, 30, 0.06)" },
      timeScale: {
        borderColor: "rgba(10, 10, 30, 0.06)",
        timeVisible: true,
        secondsVisible: false,
      },
      crosshair: {
        mode: 0, // normal (not magnet) — degen pixel-perfect read
      },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#0a8f57",
      downColor: "#c1374a",
      borderUpColor: "#0a8f57",
      borderDownColor: "#c1374a",
      wickUpColor: "#0a8f57",
      wickDownColor: "#c1374a",
    });

    const volSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "vol",
      color: "rgba(255, 45, 156, 0.4)",
    });
    chart.priceScale("vol").applyOptions({
      scaleMargins: { top: 0.85, bottom: 0 },
      borderVisible: false,
    });

    chartRef.current = chart;
    candleRef.current = candleSeries;
    volRef.current = volSeries;

    return () => {
      chart.remove();
      chartRef.current = null;
      candleRef.current = null;
      volRef.current = null;
    };
  }, []);

  // Fetch + repaint when tf or ca changes.
  useEffect(() => {
    if (!ca) return;
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      try {
        const r = await fetch(
          `/api/token/${ca}/ohlcv?tf=${tf}&limit=300`,
          { cache: "no-store" },
        );
        if (!r.ok) return;
        const json = (await r.json()) as {
          bars: CandleBar[];
          pool: string | null;
        };
        if (cancelled) return;
        setBars(json.bars);
        setPool(json.pool);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    const id = setInterval(run, 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [ca, tf]);

  // Push data into the chart.
  useEffect(() => {
    if (!candleRef.current || !volRef.current) return;
    if (bars.length === 0) {
      candleRef.current.setData([]);
      volRef.current.setData([]);
      return;
    }
    const candles = bars.map((b) => ({
      time: b.ts as Time,
      open: b.open,
      high: b.high,
      low: b.low,
      close: b.close,
    }));
    const vols = bars.map((b) => ({
      time: b.ts as Time,
      value: b.volume,
      color:
        b.close >= b.open
          ? "rgba(20, 241, 149, 0.40)"
          : "rgba(255, 45, 156, 0.40)",
    }));
    candleRef.current.setData(candles);
    volRef.current.setData(vols);
    chartRef.current?.timeScale().fitContent();
  }, [bars]);

  return (
    <div className="glass rounded-2xl p-5 sm:p-6 h-full flex flex-col">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <h3 className="text-[14px] font-bold tracking-tight text-text-primary">
            Price chart
          </h3>
          <p className="text-[11px] text-text-muted mt-0.5">
            {pool ? (
              <>
                Pool{" "}
                <span className="text-mono">
                  {pool.slice(0, 4)}…{pool.slice(-4)}
                </span>{" "}
                · refreshes 60s
              </>
            ) : loading ? (
              "Loading…"
            ) : (
              "No pool data"
            )}
          </p>
        </div>
        <div className="flex gap-1 rounded-full p-0.5 bg-text-muted/[0.06]">
          {(["1m", "5m", "15m", "1h", "4h", "1d"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTf(t)}
              className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-[0.12em] transition"
              style={{
                background: tf === t ? "var(--text-primary)" : "transparent",
                color:
                  tf === t ? "var(--bg-primary)" : "var(--text-muted)",
              }}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div
        ref={containerRef}
        className="flex-1 relative"
        style={{ minHeight: 340 }}
      >
        {bars.length === 0 && !loading && (
          <div className="absolute inset-0 flex items-center justify-center text-[12px] text-text-muted">
            No candle data for this pool. Try a different timeframe.
          </div>
        )}
      </div>
    </div>
  );
}
