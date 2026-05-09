"use client";

import { useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { PortfolioGrid, type HeldToken } from "./PortfolioGrid";
import { ReclaimPanel } from "./ReclaimPanel";
import { cn, shortAddress } from "@/lib/utils";

type Tab = "portfolio" | "reclaim";

export function WalletPulseClient() {
  const { publicKey, connected, connecting } = useWallet();
  const { setVisible } = useWalletModal();
  const [tab, setTab] = useState<Tab>("portfolio");
  const [held, setHeld] = useState<HeldToken[] | null>(null);
  const [emptyCount, setEmptyCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!publicKey) return;
    let cancelled = false;
    setLoading(true);
    fetch(`/api/wallet/${publicKey.toBase58()}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((json: { held: HeldToken[]; empty_account_count: number } | null) => {
        if (cancelled || !json) return;
        setHeld(json.held);
        setEmptyCount(json.empty_account_count);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [publicKey]);

  if (!mounted) return null;

  if (!connected || !publicKey) {
    return (
      <div className="mx-auto max-w-md text-center py-20 px-4">
        <h1 className="text-[32px] sm:text-[40px] font-semibold leading-tight">
          Wallet pulse
        </h1>
        <p className="text-text-secondary mt-3 text-[14px] leading-relaxed">
          Connect your wallet to see your portfolio at a glance and reclaim SOL
          locked in dead memecoin trades.
        </p>
        <button
          type="button"
          onClick={() => setVisible(true)}
          className="mt-7 h-12 px-6 rounded-full bg-white text-black font-medium text-[14px] hover:bg-white/90 transition"
          disabled={connecting}
        >
          {connecting ? "Connecting…" : "Connect wallet"}
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl w-full">
      <header className="flex items-end justify-between flex-wrap gap-4 mb-7">
        <div>
          <h1 className="text-[28px] sm:text-[36px] font-semibold leading-tight">
            Wallet pulse
          </h1>
          <p className="text-text-muted text-[12px] text-mono mt-1">
            {shortAddress(publicKey.toBase58(), 6, 6)}
          </p>
        </div>
        <div className="flex gap-2 glass rounded-full p-1">
          <TabBtn active={tab === "portfolio"} onClick={() => setTab("portfolio")}>
            Portfolio
          </TabBtn>
          <TabBtn active={tab === "reclaim"} onClick={() => setTab("reclaim")}>
            Hidden SOL
            {emptyCount > 0 && (
              <span className="ml-1.5 text-[10px] text-accent-pulse">
                {emptyCount}
              </span>
            )}
          </TabBtn>
        </div>
      </header>

      {tab === "portfolio" ? (
        loading ? (
          <PortfolioSkeleton />
        ) : (
          <PortfolioGrid held={held ?? []} />
        )
      ) : (
        <ReclaimPanel />
      )}
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "px-4 h-9 rounded-full text-[13px] font-medium transition",
        active
          ? "bg-white text-black"
          : "text-text-secondary hover:text-text-primary",
      )}
    >
      {children}
    </button>
  );
}

function PortfolioSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="glass rounded-2xl p-4 h-[68px] animate-shimmer" />
      ))}
    </div>
  );
}
