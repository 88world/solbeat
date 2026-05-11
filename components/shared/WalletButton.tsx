"use client";

import { useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useRouter } from "next/navigation";
import { shortAddress } from "@/lib/utils";

export function WalletButton() {
  const { publicKey, connected, disconnect, connecting } = useWallet();
  const { setVisible } = useWalletModal();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  // Prevent SSR/CSR mismatch, wallet state is browser-only.
  useEffect(() => setMounted(true), []);
  if (!mounted) {
    return (
      <button className="h-9 px-4 rounded-full text-[13px] glass text-text-secondary">
        Connect
      </button>
    );
  }

  if (!connected || !publicKey) {
    return (
      <button
        type="button"
        onClick={() => setVisible(true)}
        className="h-9 px-4 rounded-full text-[13px] font-semibold bg-text-primary text-bg-primary hover:opacity-90 hover:scale-[1.03] active:scale-[0.97] transition-all disabled:opacity-50"
        disabled={connecting}
      >
        {connecting ? "Connecting…" : "Connect wallet"}
      </button>
    );
  }

  // Connected state: primary click navigates to /wallet (the pulse view).
  // Disconnect is a secondary hover-reveal action (the small × on the right)
  // so the primary action doesn't accidentally drop the user's connection.
  return (
    <div
      className="group relative inline-flex items-stretch h-9 rounded-full glass text-text-primary hover:border-emphasized transition overflow-hidden"
      title={publicKey.toBase58()}
    >
      <button
        type="button"
        onClick={() => router.push("/wallet")}
        className="pl-3 pr-2 text-[12px] font-medium flex items-center gap-2 hover:bg-text-muted/[0.04] transition cursor-pointer"
      >
        <span className="size-1.5 rounded-full bg-signal-positive shadow-[0_0_6px_var(--signal-positive)]" />
        <span className="text-mono">{shortAddress(publicKey.toBase58())}</span>
      </button>
      {/* Disconnect affordance — only fades in on group hover. Stops
          propagation so the parent click handler doesn't navigate. */}
      <button
        type="button"
        aria-label="Disconnect wallet"
        onClick={(e) => {
          e.stopPropagation();
          disconnect();
        }}
        className="px-2.5 text-[14px] text-text-muted opacity-0 group-hover:opacity-100 hover:text-signal-negative transition-opacity border-l border-border-subtle"
      >
        ×
      </button>
    </div>
  );
}
