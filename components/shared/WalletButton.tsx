"use client";

import { useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { shortAddress } from "@/lib/utils";

export function WalletButton() {
  const { publicKey, connected, disconnect, connecting } = useWallet();
  const { setVisible } = useWalletModal();
  const [mounted, setMounted] = useState(false);

  // Prevent SSR/CSR mismatch — wallet state is browser-only.
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
        className="h-9 px-4 rounded-full text-[13px] font-medium bg-white text-black hover:bg-white/90 transition disabled:opacity-50"
        disabled={connecting}
      >
        {connecting ? "Connecting…" : "Connect wallet"}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => disconnect()}
      className="h-9 px-3 rounded-full text-[12px] font-medium glass text-text-primary hover:border-emphasized transition flex items-center gap-2"
      title={publicKey.toBase58()}
    >
      <span className="size-1.5 rounded-full bg-signal-positive shadow-[0_0_6px_var(--signal-positive)]" />
      <span className="text-mono">{shortAddress(publicKey.toBase58())}</span>
    </button>
  );
}
