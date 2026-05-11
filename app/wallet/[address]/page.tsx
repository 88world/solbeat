import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { isValidSolanaAddress } from "@/lib/solana/validation";
import { shortAddress } from "@/lib/utils";
import {
  fetchWalletIdentity,
  fetchWalletHoldings,
  fetchWalletActivity,
} from "@/lib/data/wallet";
import { smartMoneyName } from "@/lib/solana/classifier";
import { TopNav } from "@/components/shared/TopNav";
import { Aurora } from "@/components/shared/Aurora";
import { CursorBlob } from "@/components/shared/CursorBlob";
import { WalletProfileHero } from "@/components/wallet-profile/WalletProfileHero";
import { PortfolioDonut } from "@/components/wallet-profile/PortfolioDonut";
import { WalletActivityCalendar } from "@/components/wallet-profile/WalletActivityCalendar";
import { WalletHoldings } from "@/components/wallet-profile/WalletHoldings";
import { WalletActivityStream } from "@/components/wallet-profile/WalletActivityStream";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ address: string }>;
};

/**
 * Dynamic browser-tab title. Smart-money wallets get their alias inline
 * ("theo · SolBeat") so a quick scan of open tabs reads as identities
 * rather than a wall of identical truncated base58. Everyone else gets
 * the short address.
 */
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { address } = await params;
  if (!isValidSolanaAddress(address)) {
    return { title: "Wallet · SolBeat" };
  }
  const alias = smartMoneyName(address);
  const titleLead = alias ?? shortAddress(address, 6, 6);
  const title = `${titleLead} · wallet · SolBeat`;
  const description = alias
    ? `Public on-chain profile for ${alias}: holdings, activity, smart-money signals.`
    : "Public on-chain wallet profile: holdings, activity, smart-money signals.";
  return {
    title,
    description,
    openGraph: { title, description },
    twitter: { card: "summary_large_image", title, description },
  };
}

/**
 * Public wallet profile. Anyone can paste any address and see:
 *
 *   - Identity: badges (Smart · theo / Whale / Veteran / etc.), SOL
 *     balance, whale score, age, last activity
 *   - Portfolio: donut chart of holdings by USD value
 *   - Activity: 90-day GitHub-style heatmap of txn density
 *   - Holdings: enriched list of tokens with prices + 24h deltas
 *   - Activity stream: most recent signatures with timestamps
 *
 * The hero block loads server-side (single RPC + tiny signature fetch) so
 * the page paints fast. Everything else is Suspense-boundaried — the
 * holdings + activity fetchers are the slow ones, they stream in behind
 * skeletons. No client-side waterfall, no spinner-of-doom.
 */
export default async function WalletProfilePage({ params }: PageProps) {
  const { address } = await params;
  if (!isValidSolanaAddress(address)) {
    notFound();
  }

  // FAST identity: one getAccountInfo + one getSignaturesForAddress page.
  const profile = await fetchWalletIdentity(address);

  // If the user pasted a token mint to /wallet/[address], punt them to the
  // token page instead. Symmetric with the wallet redirect on the token
  // page — works in both directions, can't get stuck on the wrong route.
  if (profile.not_a_wallet === "token-mint") {
    redirect(`/token/${address}`);
  }

  return (
    <div
      className="relative flex flex-col min-h-screen"
      style={{ background: "var(--bg-primary)", color: "var(--text-primary)" }}
    >
      <Aurora />
      <CursorBlob />
      <TopNav />

      <main className="relative z-10 flex-1 mx-auto max-w-[1320px] w-full px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-[12px] text-text-muted hover:text-text-secondary transition mb-5"
        >
          ← Back
        </Link>

        <WalletProfileHero identity={profile.identity} />

        {/* Portfolio + Activity heatmap side by side on desktop, stack on mobile. */}
        <div className="mt-5 grid grid-cols-1 lg:grid-cols-[1fr_1.4fr] gap-4 lg:gap-5">
          <Suspense fallback={<DonutSkeleton />}>
            <PortfolioCell address={address} />
          </Suspense>
          <Suspense fallback={<HeatmapSkeleton />}>
            <ActivityCell address={address} />
          </Suspense>
        </div>

        {/* Holdings list + activity stream */}
        <div className="mt-5 grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-4 lg:gap-5">
          <Suspense fallback={<HoldingsSkeleton />}>
            <HoldingsCell address={address} />
          </Suspense>
          <Suspense fallback={<StreamSkeleton />}>
            <StreamCell address={address} />
          </Suspense>
        </div>

        <p className="mt-6 text-center text-[11px] text-text-muted">
          Public on-chain data only. Nothing here is financial advice.
        </p>
      </main>
    </div>
  );
}

/** ── Suspense'd cells. Each owns its own fetch so they stream in parallel. */

async function PortfolioCell({ address }: { address: string }) {
  const holdings = await fetchWalletHoldings(address);
  return <PortfolioDonut holdings={holdings} />;
}

async function ActivityCell({ address }: { address: string }) {
  const activity = await fetchWalletActivity(address);
  return <WalletActivityCalendar activity={activity} />;
}

async function HoldingsCell({ address }: { address: string }) {
  const holdings = await fetchWalletHoldings(address);
  return <WalletHoldings holdings={holdings} />;
}

async function StreamCell({ address }: { address: string }) {
  const activity = await fetchWalletActivity(address);
  return <WalletActivityStream activity={activity} />;
}

/** ── Skeletons. Match the final layout dimensions so nothing reflows. */

function DonutSkeleton() {
  return (
    <div
      className="rounded-2xl p-5 sm:p-6 h-[300px] animate-shimmer"
      style={{
        background: "var(--glass-medium)",
        border: "1px solid var(--border-subtle)",
      }}
    />
  );
}

function HeatmapSkeleton() {
  return (
    <div
      className="rounded-2xl p-5 sm:p-6 h-[300px] animate-shimmer"
      style={{
        background: "var(--glass-medium)",
        border: "1px solid var(--border-subtle)",
      }}
    />
  );
}

function HoldingsSkeleton() {
  return (
    <div
      className="rounded-2xl p-5 sm:p-6 h-[420px] animate-shimmer"
      style={{
        background: "var(--glass-medium)",
        border: "1px solid var(--border-subtle)",
      }}
    />
  );
}

function StreamSkeleton() {
  return (
    <div
      className="rounded-2xl p-5 sm:p-6 h-[420px] animate-shimmer"
      style={{
        background: "var(--glass-medium)",
        border: "1px solid var(--border-subtle)",
      }}
    />
  );
}
