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

  return (
    <>
      <TopNav />
      <main className="flex-1 mx-auto max-w-7xl w-full px-4 sm:px-6 lg:px-8 pb-24">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-[12px] text-text-muted hover:text-text-secondary transition mb-6"
        >
          ← Back
        </Link>

        <div className="mb-8">
          <TokenHeader analysis={analysis} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1.05fr_1fr] gap-5 lg:gap-7">
          <div className="space-y-5">
            <PriceCard analysis={analysis} />
            <HolderList holders={analysis.holders} />
          </div>

          <div className="space-y-5">
            <AISynthesis synthesis={analysis.synthesis} />
            <RiskScoreCard risk={analysis.risk} />
            <CatalystFeed catalysts={analysis.catalysts} />
            <RecentTweets tweets={analysis.tweets} />
          </div>
        </div>

        {analysis.warnings.length > 0 && (
          <div className="mt-8 text-[11px] text-text-muted">
            Some upstream sources were unavailable: {analysis.warnings.join(", ")}.
            Results may be partial.
          </div>
        )}

        <SwapPanel analysis={analysis} />
      </main>
    </>
  );
}
