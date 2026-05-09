import { NextResponse } from "next/server";
import { analyzeToken } from "@/lib/orchestrator/analyze";
import { isValidSolanaAddress } from "@/lib/solana/validation";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let body: { ca?: string };
  try {
    body = (await req.json()) as { ca?: string };
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const ca = (body.ca ?? "").trim();
  if (!isValidSolanaAddress(ca)) {
    return NextResponse.json({ error: "invalid_address" }, { status: 400 });
  }
  try {
    const analysis = await analyzeToken(ca);
    return NextResponse.json(analysis);
  } catch (err) {
    console.error("[api/analyze] failed", err);
    return NextResponse.json({ error: "analysis_failed" }, { status: 500 });
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const ca = (url.searchParams.get("ca") ?? "").trim();
  if (!isValidSolanaAddress(ca)) {
    return NextResponse.json({ error: "invalid_address" }, { status: 400 });
  }
  try {
    const analysis = await analyzeToken(ca);
    return NextResponse.json(analysis);
  } catch (err) {
    console.error("[api/analyze] failed", err);
    return NextResponse.json({ error: "analysis_failed" }, { status: 500 });
  }
}
