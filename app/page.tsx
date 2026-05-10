import { TopNav } from "@/components/shared/TopNav";
import { Hero } from "@/components/hero/Hero";
import { EcosystemStrip } from "@/components/hero/EcosystemStrip";

export default function Home() {
  return (
    <div
      data-theme="light"
      className="flex flex-col min-h-screen"
      style={{ background: "var(--bg-primary)", color: "var(--text-primary)" }}
    >
      <TopNav />
      <main className="flex-1 flex flex-col">
        <Hero />
        {/* Below-the-fold: live ecosystem readings. Network TPS, DeFi TVL,
            NFT activity, SOL macro. Scroll past the hero to see the whole
            Solana surface in one view. */}
        <section className="mx-auto max-w-[1320px] w-full px-5 lg:px-8 py-10 lg:py-14">
          <header className="mb-5 flex items-baseline justify-between flex-wrap gap-3">
            <div>
              <h2 className="text-[22px] sm:text-[26px] font-bold tracking-tight text-text-primary leading-tight">
                The whole Solana surface, live.
              </h2>
              <p className="text-[12.5px] text-text-secondary mt-1">
                Network TPS, DeFi TVL, NFT activity, SOL macro. Refreshes every 30s.
              </p>
            </div>
            <span className="text-[10px] uppercase tracking-[0.2em] text-text-muted font-bold">
              Ecosystem
            </span>
          </header>
          <EcosystemStrip />
        </section>
      </main>
      <footer className="px-6 pb-5 pt-2 text-center text-[11px] text-text-muted">
        Built by Block Valley Labs · Solana Frontier Hackathon
      </footer>
    </div>
  );
}
