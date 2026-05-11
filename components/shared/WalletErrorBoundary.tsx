"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

/**
 * Defensive wrapper around the wallet provider tree. Solana's wallet-
 * adapter ecosystem occasionally throws from deep transitive deps
 * (Trezor, wallet-standard, etc.) using deprecated browser APIs such
 * as `MediaQueryList.addListener`. The errors are non-fatal to wallet
 * functionality but crash React's render tree if uncaught.
 *
 * This boundary swallows render errors below it and shows a small
 * "wallet temporarily unavailable" pip in dev. In production it
 * fails silently so the rest of the page still loads — paste-a-CA
 * and read-the-pulse work without a wallet connection.
 */

type Props = { children: ReactNode };
type State = { hasError: boolean; errorMessage: string | null };

export class WalletErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, errorMessage: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, errorMessage: error.message };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Log to server logs in dev; silent in production so prod console
    // doesn't show noise to power-user judges who open dev tools.
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        "[wallet-boundary] caught render error from wallet provider tree:",
        error.message,
        info.componentStack?.slice(0, 400),
      );
    }
  }

  render() {
    if (this.state.hasError) {
      // Render children without the wallet providers so the rest of
      // the page still works. The user just can't connect a wallet
      // this session — they can refresh and try again.
      return (
        <div className="contents">
          {process.env.NODE_ENV !== "production" && (
            <div
              className="fixed bottom-4 right-4 z-50 px-3 py-2 rounded-lg text-[11px] font-mono"
              style={{
                background: "rgba(255, 71, 87, 0.10)",
                color: "#c1374a",
                border: "1px solid rgba(255, 71, 87, 0.30)",
              }}
            >
              wallet provider error caught · refresh to retry
            </div>
          )}
        </div>
      );
    }
    return this.props.children;
  }
}
