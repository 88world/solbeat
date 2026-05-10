import Link from "next/link";
import { Logo } from "./Logo";
import { WalletButton } from "./WalletButton";
import { ThemeToggle } from "./ThemeToggle";

export function TopNav() {
  return (
    <header
      className="sticky top-0 z-40 w-full"
      style={{
        // Glassmorphic nav. Both colors come from CSS vars so the toggle
        // swaps the tint between light + dark modes automatically.
        background: "var(--glass-frost)",
        backdropFilter: "saturate(180%) blur(18px)",
        WebkitBackdropFilter: "saturate(180%) blur(18px)",
        borderBottom: "1px solid var(--border-subtle)",
      }}
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 h-[64px] flex items-center justify-between">
        <Link href="/" aria-label="SolBeat home">
          <Logo />
        </Link>
        <nav className="hidden sm:flex items-center gap-7 text-[13px] text-text-secondary">
          <Link
            href="/"
            className="relative hover:text-text-primary transition group"
          >
            Home
            <span
              className="absolute -bottom-1 left-0 h-[1.5px] w-0 group-hover:w-full transition-all duration-300"
              style={{ background: "linear-gradient(90deg, #FF2D9C, #5E5CFF)" }}
            />
          </Link>
          <Link
            href="/trending"
            className="relative hover:text-text-primary transition group"
          >
            Trending
            <span
              className="absolute -bottom-1 left-0 h-[1.5px] w-0 group-hover:w-full transition-all duration-300"
              style={{ background: "linear-gradient(90deg, #FF2D9C, #5E5CFF)" }}
            />
          </Link>
          <Link
            href="/wallet"
            className="relative hover:text-text-primary transition group"
          >
            Wallet pulse
            <span
              className="absolute -bottom-1 left-0 h-[1.5px] w-0 group-hover:w-full transition-all duration-300"
              style={{ background: "linear-gradient(90deg, #FF2D9C, #5E5CFF)" }}
            />
          </Link>
          <a
            href="https://github.com/blockvalley/solbeat"
            target="_blank"
            rel="noreferrer"
            className="relative hover:text-text-primary transition group"
          >
            GitHub
            <span
              className="absolute -bottom-1 left-0 h-[1.5px] w-0 group-hover:w-full transition-all duration-300"
              style={{ background: "linear-gradient(90deg, #FF2D9C, #5E5CFF)" }}
            />
          </a>
        </nav>
        <div className="flex items-center gap-2.5">
          <ThemeToggle />
          <WalletButton />
        </div>
      </div>
    </header>
  );
}
