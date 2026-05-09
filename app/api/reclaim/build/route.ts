import { NextResponse } from "next/server";
import {
  Connection,
  PublicKey,
  SystemProgram,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import { createCloseAccountInstruction, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { isValidSolanaAddress } from "@/lib/solana/validation";
import { HELIUS_RPC } from "@/lib/data/helius";
import { FEES, LIMITS, APPROX_TOKEN_ACCOUNT_RENT_LAMPORTS } from "@/config/constants";

export const runtime = "nodejs";

const TREASURY = process.env.NEXT_PUBLIC_BV_TREASURY_WALLET;

export async function POST(req: Request) {
  let body: { owner?: string; accounts?: string[] };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const owner = (body.owner ?? "").trim();
  const accounts = (body.accounts ?? []).filter(isValidSolanaAddress);
  if (!isValidSolanaAddress(owner)) {
    return NextResponse.json({ error: "invalid_owner" }, { status: 400 });
  }
  if (accounts.length === 0) {
    return NextResponse.json({ error: "no_accounts" }, { status: 400 });
  }
  if (!TREASURY || !isValidSolanaAddress(TREASURY)) {
    return NextResponse.json({ error: "treasury_unconfigured" }, { status: 500 });
  }

  try {
    const connection = new Connection(HELIUS_RPC, "confirmed");
    const ownerKey = new PublicKey(owner);
    const treasuryKey = new PublicKey(TREASURY);

    // Batch into groups of LIMITS.RECLAIM_BATCH_SIZE
    const batches: string[][] = [];
    for (let i = 0; i < accounts.length; i += LIMITS.RECLAIM_BATCH_SIZE) {
      batches.push(accounts.slice(i, i + LIMITS.RECLAIM_BATCH_SIZE));
    }

    const { blockhash } = await connection.getLatestBlockhash("confirmed");

    const txs = batches.map((batch) => {
      const ixs = batch.map((a) =>
        createCloseAccountInstruction(
          new PublicKey(a),
          ownerKey, // refund destination = the owner's main wallet
          ownerKey,
          [],
          TOKEN_PROGRAM_ID,
        ),
      );

      // Add the treasury fee transfer at the end of the batch.
      const batchLamports = batch.length * APPROX_TOKEN_ACCOUNT_RENT_LAMPORTS;
      const feeLamports = Math.floor((batchLamports * FEES.RECLAIM_BPS) / 10_000);
      if (feeLamports > 0) {
        ixs.push(
          SystemProgram.transfer({
            fromPubkey: ownerKey,
            toPubkey: treasuryKey,
            lamports: feeLamports,
          }),
        );
      }

      const message = new TransactionMessage({
        payerKey: ownerKey,
        recentBlockhash: blockhash,
        instructions: ixs,
      }).compileToV0Message();

      const tx = new VersionedTransaction(message);
      const serialized = Buffer.from(tx.serialize()).toString("base64");
      return { account_count: batch.length, transaction: serialized };
    });

    return NextResponse.json({
      blockhash,
      batches: txs,
      fee_bps: FEES.RECLAIM_BPS,
    });
  } catch (err) {
    console.error("[api/reclaim/build] failed", err);
    return NextResponse.json({ error: "build_failed" }, { status: 500 });
  }
}
