import { TopNav } from "@/components/shared/TopNav";
import { Hero } from "@/components/hero/Hero";

export default function Home() {
  return (
    <>
      <TopNav />
      <main className="flex-1 flex flex-col">
        <Hero />
      </main>
      <footer className="px-6 pb-6 pt-2 text-center text-[11px] text-text-muted">
        Built by Block Valley Labs · Solana Frontier Hackathon entry
      </footer>
    </>
  );
}
