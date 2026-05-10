import { Suspense } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import { isValidSolanaAddress } from "@/lib/solana/validation";
import {
  analyzeFast,
  analyzeSlow,
  type FastAnalysis,
} from "@/lib/orchestrator/analyze";
import { readPulseHistory } from "@/lib/pulse/snapshots";
import type { TokenAnalysis } from "@/types/token";
import { TopNav } from "@/components/shared/TopNav";
import { CursorBlob } from "@/components/shared/CursorBlob";
import { EntranceStagger } from "@/components/shared/EntranceStagger";
import { TokenHeader } from "@/components/token/TokenHeader";
import { PriceCard } from "@/components/token/PriceCard";
import { AISynthesis } from "@/components/token/AISynthesis";
import { RiskScoreCard } from "@/components/token/RiskScoreCard";
import { CatalystFeed } from "@/components/token/CatalystFeed";
import { RecentTweets } from "@/components/token/RecentTweets";
import { HolderList } from "@/components/token/HolderList";
import { BubbleMap } from "@/components/token/BubbleMap";
import { SignalPanel } from "@/components/token/SignalPanel";
import { SwapPanel } from "@/components/token/SwapPanel";
import { PulseTimeline } from "@/components/token/PulseTimeline";
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

  // FAST slice loads first, ~1-2s. RPC + DexScreener only.
  const fast = await analyzeFast(ca);

  // No data found, neither metadata nor market data resolved. Probably a
  // wrong/case-mismatched CA, a token with no DEX liquidity, or a rugged pool.
  // Show a clear empty state instead of a wall of "-".
  const noData =
    !fast.metadata.name &&
    !fast.metadata.symbol &&
    fast.market.price_usd == null &&
    fast.market.liquidity_usd == null;

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
                case-sensitive, <code className="font-mono">aBc</code> and{" "}
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

  // Synthesize a partial TokenAnalysis for the components that take the full
  // type but only need fast fields. The slow fields stay empty until the
  // <Suspense> boundary resolves and SlowPanels takes over the right column.
  const fastAnalysis: TokenAnalysis = {
    ...fast,
    tweets: [],
    catalysts: [],
    risk: null,
    synthesis: null,
  };

  return (
    <div
      data-theme="light"
      className="relative flex flex-col min-h-screen"
      style={{ background: "var(--bg-primary)", color: "var(--text-primary)" }}
    >
      <CursorBlob />
      <TopNav />
      <main className="relative z-10 flex-1 mx-auto max-w-7xl w-full px-4 sm:px-6 lg:px-8 pb-24">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-[12px] text-text-muted hover:text-text-secondary transition mb-6 mt-2"
        >
          ← Back
        </Link>

        <EntranceStagger step={70} startDelay={80}>
          <div data-stagger-child className="mb-7" style={{ opacity: 0 }}>
            <TokenHeader analysis={fastAnalysis} />
          </div>

          {/* Row 1: PriceCard (left, fast) + AI Synthesis (right, slow). The
              "what's it priced at + what does it mean" headline. */}
          <div
            data-stagger-child
            className="grid grid-cols-1 lg:grid-cols-[1fr_1.15fr] gap-5 lg:gap-6 mb-5"
            style={{ opacity: 0 }}
          >
            <PriceCard analysis={fastAnalysis} />
            <Suspense fallback={<SynthesisSkeleton />}>
              <AISynthesisSlow ca={ca} fast={fast} />
            </Suspense>
          </div>

          {/* Row 2: Signal + Risk side-by-side. */}
          <div
            data-stagger-child
            className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5"
            style={{ opacity: 0 }}
          >
            <Suspense fallback={<CardSkeleton lines={4} />}>
              <SignalSlow ca={ca} fast={fast} />
            </Suspense>
            <Suspense fallback={<CardSkeleton lines={6} withCircle />}>
              <RiskSlow ca={ca} fast={fast} />
            </Suspense>
          </div>

          {/* Row 3: BubbleMap (left, fast) + HolderList (right, fast). */}
          <div
            data-stagger-child
            className="grid grid-cols-1 lg:grid-cols-[1.15fr_1fr] gap-5 lg:gap-6 mb-5"
            style={{ opacity: 0 }}
          >
            <BubbleMap ca={fast.metadata.ca} />
            <HolderList holders={fast.holders} ca={fast.metadata.ca} />
          </div>

          {/* Row 4a: Pulse timeline. */}
          <div data-stagger-child style={{ opacity: 0 }}>
            <Suspense fallback={null}>
              <PulseTimelineRow ca={ca} />
            </Suspense>
          </div>

          {/* Row 4b: Catalysts full-width. */}
          <div data-stagger-child className="mb-5" style={{ opacity: 0 }}>
            <Suspense fallback={<CardSkeleton lines={6} />}>
              <CatalystSlow ca={ca} fast={fast} />
            </Suspense>
          </div>

          {/* Row 5: Recent tweets, full-width. */}
          <div data-stagger-child className="mb-8" style={{ opacity: 0 }}>
            <Suspense fallback={<CardSkeleton lines={5} />}>
              <TweetsSlow ca={ca} fast={fast} />
            </Suspense>
          </div>
        </EntranceStagger>

        <SwapPanel analysis={fastAnalysis} />
      </main>
    </div>
  );
}

/**
 * Cell-level Suspense components. Each one calls analyzeSlow which is cached,
 * so the underlying network/AI work happens once even though five components
 * await it. React resolves them as the cache populates, streaming each panel
 * into place independently.
 */
async function AISynthesisSlow({
  ca,
  fast,
}: {
  ca: string;
  fast: FastAnalysis;
}) {
  const slow = await analyzeSlow(ca, fast);
  return <AISynthesis synthesis={slow.synthesis} />;
}

async function SignalSlow({ ca, fast }: { ca: string; fast: FastAnalysis }) {
  const slow = await analyzeSlow(ca, fast);
  const merged: TokenAnalysis = {
    ...fast,
    tweets: slow.tweets,
    catalysts: slow.catalysts,
    risk: slow.risk,
    synthesis: slow.synthesis,
  };
  return <SignalPanel analysis={merged} />;
}

async function RiskSlow({ ca, fast }: { ca: string; fast: FastAnalysis }) {
  const slow = await analyzeSlow(ca, fast);
  const merged: TokenAnalysis = {
    ...fast,
    tweets: slow.tweets,
    catalysts: slow.catalysts,
    risk: slow.risk,
    synthesis: slow.synthesis,
  };
  return <RiskScoreCard analysis={merged} />;
}

async function CatalystSlow({
  ca,
  fast,
}: {
  ca: string;
  fast: FastAnalysis;
}) {
  const slow = await analyzeSlow(ca, fast);
  return <CatalystFeed catalysts={slow.catalysts} />;
}

async function TweetsSlow({ ca, fast }: { ca: string; fast: FastAnalysis }) {
  const slow = await analyzeSlow(ca, fast);
  return <RecentTweets tweets={slow.tweets} />;
}

/**
 * Pulse timeline row. Lazy-reads the snapshot history from Redis. We render
 * this AFTER the slow-side has run for a few visits, so we don't block on
 * first load (the timeline appears empty on the very first visit, fills in
 * over subsequent visits as analyzeSlow stamps a snapshot each time).
 */
async function PulseTimelineRow({ ca }: { ca: string }) {
  const snapshots = await readPulseHistory(ca).catch(() => []);
  if (snapshots.length === 0) return null;
  return (
    <div className="mb-5">
      <PulseTimeline snapshots={snapshots} />
    </div>
  );
}

function SynthesisSkeleton() {
  return (
    <div className="glass rounded-2xl p-5 sm:p-6 animate-shimmer">
      <div className="h-3 w-20 rounded bg-text-muted/10 mb-4" />
      <div className="space-y-2">
        <div className="h-3 w-full rounded bg-text-muted/8" />
        <div className="h-3 w-5/6 rounded bg-text-muted/8" />
        <div className="h-3 w-4/6 rounded bg-text-muted/8" />
        <div className="h-3 w-5/6 rounded bg-text-muted/8" />
      </div>
    </div>
  );
}

function CardSkeleton({
  lines = 4,
  withCircle = false,
}: {
  lines?: number;
  withCircle?: boolean;
}) {
  return (
    <div className="glass rounded-2xl p-5 sm:p-6 animate-shimmer">
      {withCircle ? (
        <div className="flex items-center gap-5 mb-4">
          <div className="size-24 rounded-full bg-text-muted/10 shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-20 rounded bg-text-muted/10" />
            <div className="h-3 w-full rounded bg-text-muted/8" />
          </div>
        </div>
      ) : (
        <div className="h-3 w-20 rounded bg-text-muted/10 mb-4" />
      )}
      <div className="space-y-2.5">
        {Array.from({ length: lines }).map((_, i) => (
          <div
            key={i}
            className="h-3 rounded bg-text-muted/8"
            style={{ width: `${88 - i * 8}%` }}
          />
        ))}
      </div>
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
