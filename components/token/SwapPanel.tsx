"use client";

import { useEffect, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { VersionedTransaction } from "@solana/web3.js";
import type { JupiterQuote } from "@/lib/data/jupiter";
import type { TokenAnalysis } from "@/types/token";
import { LAMPORTS_PER_SOL, SOL_MINT } from "@/config/constants";
import { humanizeNumber } from "@/lib/utils";

export function SwapPanel({ analysis }: { analysis: TokenAnalysis }) {
  const [open, setOpen] = useState(false);
  const [solAmount, setSolAmount] = useState("0.1");
  const [quote, setQuote] = useState<JupiterQuote | null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const { publicKey, signTransaction } = useWallet();
  const { connection } = useConnection();

  useEffect(() => {
    if (!open) return;
    const lamports = Math.floor(parseFloat(solAmount) * LAMPORTS_PER_SOL);
    if (!Number.isFinite(lamports) || lamports <= 0) {
      setQuote(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const fetchQuote = async () => {
      try {
        const r = await fetch(
          `/api/swap/quote?inputMint=${SOL_MINT}&outputMint=${analysis.metadata.ca}&amount=${lamports}&slippageBps=100`,
          { cache: "no-store" },
        );
        if (!r.ok) {
          setQuote(null);
          return;
        }
        const json = (await r.json()) as JupiterQuote;
        if (!cancelled) setQuote(json);
      } catch {
        if (!cancelled) setQuote(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchQuote();
    const id = setInterval(fetchQuote, 8000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [open, solAmount, analysis.metadata.ca]);

  const swap = async () => {
    if (!publicKey || !signTransaction || !quote) return;
    setStatus("Building transaction…");
    try {
      const r = await fetch("/api/swap/build", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ quote, userPublicKey: publicKey.toBase58() }),
      });
      if (!r.ok) {
        setStatus("Could not build swap.");
        return;
      }
      const { swapTransaction } = (await r.json()) as { swapTransaction: string };
      const txBuf = Uint8Array.from(atob(swapTransaction), (c) => c.charCodeAt(0));
      const tx = VersionedTransaction.deserialize(txBuf);
      setStatus("Sign in your wallet…");
      const signed = await signTransaction(tx);
      setStatus("Submitting…");
      const sig = await connection.sendRawTransaction(signed.serialize(), {
        skipPreflight: false,
      });
      setStatus(`Submitted: ${sig.slice(0, 8)}…`);
    } catch (err) {
      console.error(err);
      setStatus("Swap failed, try again.");
    }
  };

  const out =
    quote && analysis.metadata.decimals != null
      ? Number(quote.outAmount) / Math.pow(10, analysis.metadata.decimals)
      : null;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-30 h-12 px-5 rounded-full bg-white text-black font-medium text-[13px] shadow-[0_8px_30px_rgba(0,0,0,0.4)] hover:scale-105 transition"
      >
        Swap ${analysis.metadata.symbol ?? "token"}
      </button>
    );
  }

  return (
    <div className="fixed bottom-5 right-5 z-30 w-[340px] glass rounded-2xl p-5 shadow-[0_20px_60px_rgba(0,0,0,0.5)]">
      <div className="flex items-center justify-between mb-4">
        <div className="text-[12px] uppercase tracking-[0.2em] text-text-muted">
          Jupiter swap
        </div>
        <button
          onClick={() => setOpen(false)}
          className="text-text-muted hover:text-text-primary text-[14px]"
          aria-label="Close swap panel"
        >
          ×
        </button>
      </div>

      <label className="block text-[11px] text-text-muted mb-1.5">You pay</label>
      <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-emphasized bg-white/[0.03]">
        <input
          type="number"
          step="0.01"
          min="0"
          value={solAmount}
          onChange={(e) => setSolAmount(e.target.value)}
          className="flex-1 bg-transparent outline-none text-mono text-[15px] text-text-primary"
        />
        <span className="text-[12px] text-text-secondary">SOL</span>
      </div>

      <div className="mt-3 text-[11px] text-text-muted">
        You receive
        <span className="float-right text-text-primary text-mono">
          {loading ? "…" : out != null ? `${humanizeNumber(out, 4)} ${analysis.metadata.symbol ?? ""}` : "-"}
        </span>
      </div>
      {quote?.priceImpactPct && (
        <div className="text-[10px] text-text-muted mt-1">
          Impact {(parseFloat(quote.priceImpactPct) * 100).toFixed(2)}%
          <span className="float-right">SolBeat fee 0.20%</span>
        </div>
      )}

      <button
        type="button"
        disabled={!publicKey || !quote}
        onClick={swap}
        className="mt-4 w-full h-11 rounded-full bg-white text-black font-medium text-[13px] hover:bg-white/90 transition disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {publicKey ? (quote ? "Swap" : "No route") : "Connect wallet"}
      </button>
      {status && (
        <div className="mt-2 text-[11px] text-text-secondary">{status}</div>
      )}
    </div>
  );
}
