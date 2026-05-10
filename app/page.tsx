import { TopNav } from "@/components/shared/TopNav";
import { Hero } from "@/components/hero/Hero";
import { EcosystemStrip } from "@/components/hero/EcosystemStrip";
import { TokensToWatch } from "@/components/hero/TokensToWatch";
import { WalletHero } from "@/components/hero/WalletHero";
import { CursorBlob } from "@/components/shared/CursorBlob";
import { Aurora } from "@/components/shared/Aurora";
import { ScrollReveal } from "@/components/shared/ScrollReveal";

export default function Home() {
  return (
    <div
      className="relative flex flex-col min-h-screen"
      style={{ background: "var(--bg-primary)", color: "var(--text-primary)" }}
    >
      {/* Layered ambient backdrop. Aurora is the slow drift in the back,
          CursorBlob follows the mouse. Both behind a z-0 so content stays
          on top via z-10 on main. */}
      <Aurora />
      <CursorBlob />
      <TopNav />
      <main className="relative flex-1 flex flex-col z-10">
        <Hero />

        {/* Wallet hero — the SolBeat selling point. Disconnected: pitch
            for "you have hidden SOL." Connected: massive count-up of
            recoverable SOL + portfolio quick view + reclaim CTA. Sits
            right under the hero so it's the first thing a connected
            user sees. */}
        <section className="mx-auto max-w-[1320px] w-full px-5 lg:px-8">
          <WalletHero />
        </section>

        {/* Below-the-fold: live ecosystem readings. Network TPS, DeFi TVL,
            NFT activity, SOL macro. Scroll past the hero to see the whole
            Solana surface in one view. */}
        <ScrollReveal
          className="mx-auto max-w-[1320px] w-full px-5 lg:px-8 py-10 lg:py-14"
          childSelector=":scope > *"
          step={80}
          travel={28}
        >
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
        </ScrollReveal>

        {/* Tokens to Watch — the differentiator math. Recently-graduated
            pump.fun tokens in the post-launch survival band that have
            healthy buy pressure. Where alpha exists before the herd. */}
        <ScrollReveal
          className="mx-auto max-w-[1320px] w-full px-5 lg:px-8 py-4 lg:py-6"
          childSelector=":scope > *"
          step={80}
          travel={28}
        >
          <TokensToWatch />
        </ScrollReveal>
      </main>
      <footer className="px-6 pb-5 pt-2 text-center text-[11px] text-text-muted">
        Built by Block Valley Labs · Solana Frontier Hackathon
      </footer>
    </div>
  );
}
