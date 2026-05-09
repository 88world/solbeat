import { notFound } from "next/navigation";
import Link from "next/link";
import { isValidSolanaAddress } from "@/lib/solana/validation";
import { analyzeToken } from "@/lib/orchestrator/analyze";
import { TopNav } from "@/components/shared/TopNav";
import { TokenHeader } from "@/components/token/TokenHeader";
import { PriceCard } from "@/components/token/PriceCard";
import { AISynthesis } from "@/components/token/AISynthesis";
import { RiskScoreCard } from "@/components/token/RiskScoreCard";
import { CatalystFeed } from "@/components/token/CatalystFeed";
import { RecentTweets } from "@/components/token/RecentTweets";
import { HolderList } from "@/components/token/HolderList";
import { SwapPanel } from "@/components/token/SwapPanel";
import { shortAddress } from "@/lib/utils";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ ca: string }>;
};

export default async function TokenPage({ params }: PageProps) {
  const { ca } = await params;
  if (!isValidSolanaAddress(ca)) {
    notFound();
  }
  const analysis = await analyzeToken(ca);

  // No data found — neither metadata nor market data resolved. Probably a
  // wrong/case-mismatched CA, a token with no DEX liquidity, or a rugged pool.
  // Show a clear empty state instead of a wall of "—".
  const noData =
    !analysis.metadata.name &&
    !analysis.metadata.symbol &&
    analysis.market.price_usd == null &&
    analysis.market.liquidity_usd == null;

  if (noData) {
    return (
      <div
        data-theme="light"
        className="flex flex-col min-h-screen"
        style={{ background: "var(--bg-primary)", color: "var(--text-primary)" }}
      >
        <TopNav />
        <main className="flex-1 mx-auto max-w-2xl w-full px-6 py-12">
          <Link
            href="/"
            className="inline-flex items-center gap-1 text-[12px] text-text-muted hover:text-text-secondary transition mb-8"
          >
            ← Back
          </Link>

          <div
            className="rounded-3xl p-8 sm:p-10"
            style={{
              background: "rgba(255, 255, 255, 0.7)",
              backdropFilter: "blur(20px) saturate(160%)",
              WebkitBackdropFilter: "blur(20px) saturate(160%)",
              border: "1px solid rgba(10, 10, 30, 0.06)",
              boxShadow: "0 18px 50px rgba(10, 10, 30, 0.06)",
            }}
          >
            <div className="text-[10.5px] uppercase tracking-[0.2em] text-text-muted font-bold mb-3">
              No pulse · 404
            </div>
            <h1 className="text-[28px] sm:text-[36px] font-extrabold tracking-[-0.03em] leading-tight text-text-primary">
              Couldn&apos;t find this token.
            </h1>
            <p className="mt-4 text-[14px] text-text-secondary leading-relaxed">
              We came up empty on{" "}
              <code className="font-mono text-[13px] px-2 py-0.5 rounded-md bg-text-muted/8 text-text-primary">
                {shortAddress(ca, 6, 6)}
              </code>
              . No market data, no on-chain metadata.
            </p>

            <div className="mt-6 space-y-3">
              <Reason emoji="🔡">
                <span className="font-semibold">Wrong case.</span> Solana addresses are
                case-sensitive — <code className="font-mono">aBc</code> and{" "}
                <code className="font-mono">ABC</code> are different addresses.
                Copy the CA again from a trusted source.
              </Reason>
              <Reason emoji="🆕">
                <span className="font-semibold">Brand-new token.</span> If the pool
                was just deployed, DexScreener may not have indexed it yet. Try
                again in a few minutes.
              </Reason>
              <Reason emoji="🪦">
                <span className="font-semibold">Rugged or migrated.</span> If the
                LP was pulled or the token migrated to a new mint, the old address
                won&apos;t resolve.
              </Reason>
            </div>

            <div className="mt-8 flex items-center gap-3 flex-wrap">
              <Link
                href="/"
                className="inline-flex items-center px-5 h-10 rounded-full bg-text-primary text-bg-primary text-[13px] font-semibold hover:scale-[1.03] active:scale-[0.97] transition"
              >
                Try another address →
              </Link>
              <a
                href={`https://solscan.io/account/${ca}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center px-4 h-10 rounded-full text-[13px] text-text-secondary border border-border-subtle hover:border-border-emphasized transition"
              >
                Check on Solscan
              </a>
            </div>

            <div className="mt-6 pt-5 border-t border-border-subtle text-[11px] text-text-muted">
              Full address:{" "}
              <code className="font-mono break-all">{ca}</code>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div
      data-theme="light"
      className="flex flex-col min-h-screen"
      style={{ background: "var(--bg-primary)", color: "var(--text-primary)" }}
    >
      <TopNav />
      <main className="flex-1 mx-auto max-w-7xl w-full px-4 sm:px-6 lg:px-8 pb-24">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-[12px] text-text-muted hover:text-text-secondary transition mb-6 mt-2"
        >
          ← Back
        </Link>

        <div className="mb-8">
          <TokenHeader analysis={analysis} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1.05fr_1fr] gap-5 lg:gap-7">
          <div className="space-y-5">
            <PriceCard analysis={analysis} />
            <HolderList holders={analysis.holders} ca={analysis.metadata.ca} />
          </div>

          <div className="space-y-5">
            <AISynthesis synthesis={analysis.synthesis} />
            <RiskScoreCard risk={analysis.risk} />
            <CatalystFeed catalysts={analysis.catalysts} />
            <RecentTweets tweets={analysis.tweets} />
          </div>
        </div>

        <SwapPanel analysis={analysis} />
      </main>
    </div>
  );
}

function Reason({
  emoji,
  children,
}: {
  emoji: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 text-[13px] text-text-secondary leading-relaxed">
      <span className="text-[15px] shrink-0">{emoji}</span>
      <span>{children}</span>
    </div>
  );
}
