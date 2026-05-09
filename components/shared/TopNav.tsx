import Link from "next/link";
import { Logo } from "./Logo";
import { WalletButton } from "./WalletButton";

export function TopNav() {
  return (
    <header className="sticky top-0 z-40 w-full">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 h-[64px] flex items-center justify-between">
        <Link href="/" aria-label="SolBeat home">
          <Logo />
        </Link>
        <nav className="hidden sm:flex items-center gap-6 text-[13px] text-text-secondary">
          <Link href="/wallet" className="hover:text-text-primary transition">
            Wallet pulse
          </Link>
          <a
            href="https://github.com/blockvalley/solbeat"
            target="_blank"
            rel="noreferrer"
            className="hover:text-text-primary transition"
          >
            GitHub
          </a>
        </nav>
        <div className="flex items-center gap-3">
          <WalletButton />
        </div>
      </div>
    </header>
  );
}
