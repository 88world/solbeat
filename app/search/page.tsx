import Link from "next/link";
import { TopNav } from "@/components/shared/TopNav";
import { fetchTrending } from "@/lib/data/dexscreener";
import { humanizeNumber, pctChange } from "@/lib/utils";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ q?: string }>;
};

export default async function SearchPage({ searchParams }: PageProps) {
  const { q } = await searchParams;
  const query = (q ?? "").toUpperCase();

  // For v1 we filter the trending list by symbol match. A proper search would
  // hit Birdeye's /defi/v3/search endpoint or similar.
  const trending = await fetchTrending().catch(() => []);
  const matches = query
    ? trending.filter((t) => t.symbol?.toUpperCase().includes(query))
    : trending;

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
                  <div
                    className={
                      (t.price_change_24h ?? 0) >= 0
                        ? "text-signal-positive text-mono text-[12px]"
                        : "text-signal-negative text-mono text-[12px]"
                    }
                  >
                    {pctChange(t.price_change_24h ?? 0)}
                  </div>
                  <div className="text-text-secondary text-mono text-[12px] w-20 text-right">
                    ${humanizeNumber(t.volume_24h ?? 0)}
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
