"use client";

import { useMemo, type ReactNode } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import {
  PhantomWalletAdapter,
  SolflareWalletAdapter,
} from "@solana/wallet-adapter-wallets";
import "@solana/wallet-adapter-react-ui/styles.css";
import { WalletErrorBoundary } from "@/components/shared/WalletErrorBoundary";

export function Providers({ children }: { children: ReactNode }) {
  const endpoint = useMemo(() => {
    return (
      process.env.NEXT_PUBLIC_SOLANA_RPC ??
      "https://api.mainnet-beta.solana.com"
    );
  }, []);

  const wallets = useMemo(
    () => [new PhantomWalletAdapter(), new SolflareWalletAdapter()],
    [],
  );

  // WalletErrorBoundary catches crashes from deep wallet-adapter
  // transitive deps (e.g. Trezor's MediaQueryList.addListener call)
  // that would otherwise blow up the entire page render. The rest of
  // the app still works — only the wallet UI degrades.
  return (
    <WalletErrorBoundary>
      <ConnectionProvider endpoint={endpoint}>
        <WalletProvider wallets={wallets} autoConnect>
          <WalletModalProvider>{children}</WalletModalProvider>
        </WalletProvider>
      </ConnectionProvider>
    </WalletErrorBoundary>
  );
}
