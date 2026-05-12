import { NextResponse } from "next/server";
import { Connection } from "@solana/web3.js";
import { HELIUS_RPC } from "@/lib/data/helius";

export const runtime = "nodejs";

/**
 * Server-side submission for signed reclaim transactions.
 *
 * Why route the submit through us instead of letting the client
 * `connection.sendRawTransaction` directly:
 *
 * The client's ConnectionProvider points at NEXT_PUBLIC_SOLANA_RPC, which
 * in production typically falls back to the public mainnet-beta endpoint.
 * That node lags Helius by several slots on a busy day — by the time the
 * user clicks Confirm in Phantom (10-30s after the build), the public RPC
 * hasn't seen the blockhash we fetched server-side from Helius, so
 * `sendRawTransaction` returns "Blockhash not found" before the tx ever
 * reaches a validator. Submitting via Helius (same RPC that minted the
 * blockhash) closes the race window.
 *
 * Signing still happens entirely in the wallet — we never see the user's
 * private key, only the already-signed bytes that the client returns from
 * Phantom's `signAllTransactions`.
 */
export async function POST(req: Request) {
  let body: { signed?: string[] };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const signed = body.signed ?? [];
  if (!Array.isArray(signed) || signed.length === 0) {
    return NextResponse.json({ error: "no_transactions" }, { status: 400 });
  }
  // Sanity-cap: a single user shouldn't be batching more than the
  // build endpoint allows. Keeps a malformed client from spraying
  // anything weird through us.
  if (signed.length > 16) {
    return NextResponse.json({ error: "too_many_batches" }, { status: 400 });
  }

  const connection = new Connection(HELIUS_RPC, "confirmed");
  const sigs: string[] = [];
  const errors: Array<{ index: number; message: string }> = [];

  for (let i = 0; i < signed.length; i++) {
    try {
      const raw = Buffer.from(signed[i], "base64");
      // skipPreflight: true — server-side simulation against Helius is
      // redundant since the build endpoint already validated the
      // instruction list. Skipping cuts ~1 round trip and avoids the
      // "Blockhash not found" pre-flight rejection when chain state
      // moved on between fetch and send.
      const sig = await connection.sendRawTransaction(raw, {
        skipPreflight: true,
        maxRetries: 3,
      });
      sigs.push(sig);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push({ index: i, message });
      // Continue submitting remaining batches — partial success is more
      // useful than aborting everything on the first failure.
    }
  }

  if (sigs.length === 0) {
    return NextResponse.json(
      { error: "submit_failed", errors },
      { status: 502 },
    );
  }
  return NextResponse.json({ sigs, errors });
}
