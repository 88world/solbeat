import { TopNav } from "@/components/shared/TopNav";
import { Hero } from "@/components/hero/Hero";

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
      </main>
      <footer className="px-6 pb-5 pt-2 text-center text-[11px] text-text-muted">
        Built by Block Valley Labs · Solana Frontier Hackathon
      </footer>
    </div>
  );
}
