import Link from "next/link";
import { TopNav } from "@/components/shared/TopNav";
import { fetchTrending, searchBySymbol } from "@/lib/data/dexscreener";
import { humanizeNumber, pctChange } from "@/lib/utils";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ q?: string }>;
};

export default async function SearchPage({ searchParams }: PageProps) {
  const { q } = await searchParams;
  const rawQuery = (q ?? "").trim().replace(/^\$/, "");
  const query = rawQuery.toUpperCase();

  // When the user has a query, hit DexScreener's text search directly so
  // established tokens (BONK, WIF, JUP) resolve even though they don't crack
  // the trending top-16 by score anymore. With no query, show trending.
  const matches = query
    ? await searchBySymbol(rawQuery).catch(() => [])
    : await fetchTrending().catch(() => []);

  return (
    <>
      <TopNav />
      <main className="flex-1 mx-auto max-w-3xl w-full px-4 sm:px-6 py-10">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-[12px] text-text-muted hover:text-text-secondary transition mb-4"
        >
          ← Back
        </Link>
        <h1 className="text-[28px] font-semibold mb-1">
          Searching for ${query}
        </h1>
        <p className="text-text-muted text-[13px] mb-7">
          Showing trending matches. Paste a contract address for the full
          analysis.
        </p>

        {matches.length === 0 ? (
          <div className="glass rounded-2xl p-6 text-[13px] text-text-secondary">
            No matches in the trending feed. Try pasting the contract address
            directly.
          </div>
        ) : (
          <ul className="space-y-2">
            {matches.map((t) => (
              <li key={t.ca}>
                <Link
                  href={`/token/${t.ca}`}
                  className="glass rounded-2xl p-4 flex items-center gap-3 hover:border-emphasized transition"
                >
                  <div className="size-10 rounded-xl bg-white/5 overflow-hidden flex items-center justify-center shrink-0">
                    {t.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={t.image}
                        alt={t.symbol}
                        className="size-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <span className="text-[10px] text-text-muted">
                        {t.symbol.slice(0, 3)}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-[14px]">${t.symbol}</div>
                    <div className="text-text-muted text-[11px] truncate">
                      {t.name}
                    </div>
                  </div>
                  <div className="flex flex-col items-end shrink-0">
                    <div className="text-text-primary text-mono text-[13px] font-semibold">
                      {t.market_cap != null
                        ? `$${humanizeNumber(t.market_cap)}`
                        : t.fdv != null
                          ? `$${humanizeNumber(t.fdv)}`
                          : "-"}
                    </div>
                    <div className="text-text-muted text-[10px] uppercase tracking-[0.12em] font-bold">
                      mcap
                    </div>
                  </div>
                  <div
                    className={
                      (t.price_change_24h ?? 0) >= 0
                        ? "text-signal-positive text-mono text-[12px] w-16 text-right"
                        : "text-signal-negative text-mono text-[12px] w-16 text-right"
                    }
                  >
                    {pctChange(t.price_change_24h ?? 0)}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
