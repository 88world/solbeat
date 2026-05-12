"use client";

import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { VersionedTransaction } from "@solana/web3.js";

/**
 * Shared reclaim flow. The hidden-SOL hero CTA and the dead-accounts
 * panel button both call this — before this hook existed, the hero CTA
 * only switched tabs and the panel CTA actually fired the chain action,
 * which read as "the loud button does nothing." Now both buttons share
 * one path: build → sign → submit → status banner.
 *
 * Pass it the scan result so it knows which token-account pubkeys to
 * close + the user-facing SOL number for the success message.
 */
export type ReclaimScan = {
  user_receives_sol: number;
  accounts: Array<{ pubkey: string }>;
};

export type ReclaimStatus =
  | { kind: "info"; text: string }
  | { kind: "ok"; text: string; sig?: string }
  | { kind: "err"; text: string };

export function useReclaim(scan: ReclaimScan | null) {
  const { publicKey, signAllTransactions } = useWallet();
  const [status, setStatus] = useState<ReclaimStatus | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const reclaim = async () => {
    // Surface each precondition as a loud status rather than silent return
    // — the original bug here was an early `if (...) return;` that left
    // users staring at a dead button with zero feedback when their wallet
    // adapter didn't expose signAllTransactions or scan hadn't resolved.
    if (!publicKey) {
      setStatus({ kind: "err", text: "Connect a wallet first." });
      return;
    }
    if (!signAllTransactions) {
      setStatus({
        kind: "err",
        text: "Your wallet adapter doesn't expose signAllTransactions. Try Phantom or Solflare.",
      });
      return;
    }
    if (!scan || scan.accounts.length === 0) {
      setStatus({ kind: "err", text: "Nothing to reclaim." });
      return;
    }

    setSubmitting(true);
    setStatus({ kind: "info", text: "Building transactions…" });
    try {
      const r = await fetch("/api/reclaim/build", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          owner: publicKey.toBase58(),
          accounts: scan.accounts.map((a) => a.pubkey),
        }),
      });
      if (!r.ok) {
        const err = (await r.json().catch(() => ({}))) as { error?: string };
        if (err.error === "treasury_unconfigured") {
          setStatus({
            kind: "err",
            text: "Reclaim is paused on this deployment — the treasury wallet env var (NEXT_PUBLIC_BV_TREASURY_WALLET) isn't set on the server. Add a base58 Solana address in Vercel → Settings → Environment Variables and redeploy.",
          });
        } else {
          setStatus({
            kind: "err",
            text: `Build failed (${err.error ?? "unknown"}). Try again or refresh the page.`,
          });
        }
        return;
      }
      const { batches } = (await r.json()) as {
        batches: Array<{ account_count: number; transaction: string }>;
      };
      const txs = batches.map((b) => {
        const buf = Uint8Array.from(atob(b.transaction), (c) => c.charCodeAt(0));
        return VersionedTransaction.deserialize(buf);
      });

      setStatus({
        kind: "info",
        text: `Sign ${txs.length} batch${txs.length === 1 ? "" : "es"} in your wallet…`,
      });
      const signed = await signAllTransactions(txs);

      setStatus({ kind: "info", text: "Submitting to chain…" });
      // Submit via /api/reclaim/submit which routes through Helius — same
      // RPC the build endpoint used to fetch the blockhash. The wallet
      // adapter's own `connection` falls back to the public mainnet-beta
      // RPC, which lags Helius by several slots and reliably rejects our
      // blockhash as "not found" before the tx reaches a validator.
      const submitRes = await fetch("/api/reclaim/submit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          signed: signed.map((tx) =>
            Buffer.from(tx.serialize()).toString("base64"),
          ),
        }),
      });
      if (!submitRes.ok) {
        const errBody = (await submitRes.json().catch(() => ({}))) as {
          error?: string;
          errors?: Array<{ message: string }>;
        };
        const first = errBody.errors?.[0]?.message ?? errBody.error ?? "unknown";
        // Blockhash-expired is the recoverable one — telling the user to
        // just click again works because the next build will pull a fresh
        // blockhash. Phrased explicitly so the path forward is obvious.
        const stale = /blockhash|expired|not found/i.test(first);
        setStatus({
          kind: "err",
          text: stale
            ? "Transaction expired before it landed (Solana blockhashes are valid for ~60s). Click Reclaim again — a fresh batch will be built."
            : `Submission failed: ${first.slice(0, 160)}`,
        });
        return;
      }
      const { sigs } = (await submitRes.json()) as { sigs: string[] };
      setStatus({
        kind: "ok",
        text: `Reclaimed ${scan.user_receives_sol.toFixed(4)} SOL across ${sigs.length} batch${
          sigs.length === 1 ? "" : "es"
        }.`,
        sig: sigs[0],
      });
    } catch (err) {
      console.error(err);
      const msg = err instanceof Error ? err.message : String(err);
      const rejected = /reject|denied|user/i.test(msg);
      setStatus({
        kind: rejected ? "info" : "err",
        text: rejected
          ? "Cancelled in wallet. No SOL was moved."
          : `Reclaim failed: ${msg.slice(0, 140)}`,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return { status, submitting, reclaim };
}
