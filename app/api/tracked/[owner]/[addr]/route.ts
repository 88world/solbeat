import { NextResponse } from "next/server";
import { isValidSolanaAddress } from "@/lib/solana/validation";
import { renameTracked, untrack, TRACKED_MAX } from "@/lib/tracking/storage";

export const runtime = "nodejs";

/** PATCH /api/tracked/[owner]/[addr] → rename a tracked wallet's label. */
export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ owner: string; addr: string }> },
) {
  const { owner, addr } = await ctx.params;
  if (!isValidSolanaAddress(owner) || !isValidSolanaAddress(addr)) {
    return NextResponse.json({ error: "invalid_address" }, { status: 400 });
  }
  let body: { label?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const label = (body.label ?? "").trim().slice(0, 40);
  if (!label) {
    return NextResponse.json({ error: "label_required" }, { status: 400 });
  }
  try {
    const list = await renameTracked(owner, addr, label);
    return NextResponse.json({ list, max: TRACKED_MAX });
  } catch {
    return NextResponse.json({ error: "storage_failed" }, { status: 500 });
  }
}

/** DELETE /api/tracked/[owner]/[addr] → untrack a wallet. */
export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ owner: string; addr: string }> },
) {
  const { owner, addr } = await ctx.params;
  if (!isValidSolanaAddress(owner) || !isValidSolanaAddress(addr)) {
    return NextResponse.json({ error: "invalid_address" }, { status: 400 });
  }
  try {
    const list = await untrack(owner, addr);
    return NextResponse.json({ list, max: TRACKED_MAX });
  } catch {
    return NextResponse.json({ error: "storage_failed" }, { status: 500 });
  }
}
