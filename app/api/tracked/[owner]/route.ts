import { NextResponse } from "next/server";
import { isValidSolanaAddress } from "@/lib/solana/validation";
import {
  addTracked,
  getTrackedList,
  TRACKED_MAX,
} from "@/lib/tracking/storage";

export const runtime = "nodejs";

/** GET /api/tracked/[owner] → list of tracked wallets for this owner. */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ owner: string }> },
) {
  const { owner } = await ctx.params;
  if (!isValidSolanaAddress(owner)) {
    return NextResponse.json({ error: "invalid_owner" }, { status: 400 });
  }
  try {
    const list = await getTrackedList(owner);
    return NextResponse.json({ list, max: TRACKED_MAX });
  } catch {
    return NextResponse.json({ list: [], max: TRACKED_MAX, degraded: true });
  }
}

/** POST /api/tracked/[owner] → add a tracked wallet. Server enforces max-2. */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ owner: string }> },
) {
  const { owner } = await ctx.params;
  if (!isValidSolanaAddress(owner)) {
    return NextResponse.json({ error: "invalid_owner" }, { status: 400 });
  }
  let body: { addr?: string; label?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const addr = (body.addr ?? "").trim();
  const label = (body.label ?? "").trim().slice(0, 40);
  if (!isValidSolanaAddress(addr)) {
    return NextResponse.json({ error: "invalid_addr" }, { status: 400 });
  }
  if (!label) {
    return NextResponse.json({ error: "label_required" }, { status: 400 });
  }
  if (addr === owner) {
    return NextResponse.json({ error: "cant_track_self" }, { status: 400 });
  }
  try {
    const list = await addTracked(owner, { addr, label });
    if (list === null) {
      return NextResponse.json(
        { error: "limit_reached", max: TRACKED_MAX },
        { status: 402 },
      );
    }
    return NextResponse.json({ list, max: TRACKED_MAX });
  } catch {
    return NextResponse.json({ error: "storage_failed" }, { status: 500 });
  }
}
