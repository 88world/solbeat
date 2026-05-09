import Link from "next/link";
import { fetchTrendingFull } from "@/lib/data/dexscreener";
import { TopNav } from "@/components/shared/TopNav";
import { TrendingTable } from "@/components/trending/TrendingTable";

export const dynamic = "force-dynamic";

export default async function TrendingPage() {
  const tokens = await fetchTrendingFull(50);

  return (
    <div
      data-theme="light"
      className="flex flex-col min-h-screen"
      style={{ background: "var(--bg-primary)", color: "var(--text-primary)" }}
    >
      <TopNav />
      <main className="flex-1 mx-auto max-w-[1480px] w-full px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex items-end justify-between gap-4 mb-5">
          <div>
            <Link
              href="/"
              className="inline-flex items-center gap-1 text-[11px] text-text-muted hover:text-text-secondary transition mb-2"
            >
              ← Back
            </Link>
            <h1 className="text-[28px] sm:text-[34px] font-extrabold tracking-[-0.03em] leading-[1.05]">
              Solana trending
            </h1>
            <p className="mt-1 text-[12.5px] text-text-secondary">
              {tokens.length} live pairs · sortable · click any row to read its pulse
            </p>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-text-muted font-bold">
            <span className="relative flex size-1.5">
              <span className="absolute inline-flex h-full w-full rounded-full bg-accent-pulse opacity-75 animate-ping" />
              <span className="relative inline-flex size-1.5 rounded-full bg-accent-pulse" />
            </span>
            Live · 15s
          </div>
        </div>

        <TrendingTable tokens={tokens} />

        <p className="mt-4 text-[10px] text-text-muted text-center">
          Risk badge is heuristic — based on liquidity, pool age, volume-to-liquidity ratio, and 24h move size. Not financial advice.
        </p>
      </main>
    </div>
  );
}
