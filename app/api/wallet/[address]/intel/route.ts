import { NextResponse } from "next/server";
import { isValidSolanaAddress } from "@/lib/solana/validation";
import {
  getTokenAccountsByOwner,
  getAccountKind,
  lamportsToSol,
} from "@/lib/data/helius";
import { fetchBestSolanaPair } from "@/lib/data/dexscreener";
import { getKolHoldings } from "@/lib/data/kol-holdings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Wallet intel — the "second brain" pulled from public on-chain data only.
 * Surfaces:
 *
 *   - aggregate_risk: 0..100 weighted by USD position size, with the
 *     verdict that goes with it ("safe" / "cautious" / "loaded" / "danger")
 *   - top_flagged: up to 3 positions with the worst risk + the reasons
 *     (e.g. "no DEX pair", "−72% in 24h", "tiny liquidity")
 *   - smart_overlap: KOL wallets sharing tokens with the user. Surfaces
 *     "you and theo both hold $XYZ", which is the differentiator hook
 *   - recoverable_sol: SOL locked in empty token accounts (0.002/each)
 *   - sol_balance, total_value_usd, position_count: header stats
 *
 * Designed to be slow-fetch-resistant: every external call is wrapped in
 * its own try/catch and we degrade gracefully (empty arrays, zeros) so the
 * panel always renders. Heavy work runs in parallel.
 */

const RENT_PER_EMPTY_ACCOUNT_SOL = 0.00203928;

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ address: string }> },
) {
  const { address } = await ctx.params;
  if (!isValidSolanaAddress(address)) {
    return NextResponse.json({ error: "invalid_address" }, { status: 400 });
  }

  // Run the three heavy fetches in parallel so the slowest one bounds
  // total response time, not the sum.
  const [accountInfo, accounts, kol] = await Promise.all([
    getAccountKind(address).catch(() => ({ kind: "unknown" as const, lamports: 0 })),
    getTokenAccountsByOwner(address).catch(() => []),
    getKolHoldings().catch(() => []),
  ]);

  const solBalance = lamportsToSol(accountInfo.lamports);

  const held = accounts.filter(
    (a) => (a.account.data.parsed.info.tokenAmount.uiAmount ?? 0) > 0,
  );
  const emptyCount = accounts.length - held.length;
  const recoverable_sol = emptyCount * RENT_PER_EMPTY_ACCOUNT_SOL;

  // Top 24 positions by raw balance → enrich for prices in parallel.
  // We cap because each enrichment is a DexScreener call.
  held.sort((a, b) => {
    const ba = a.account.data.parsed.info.tokenAmount.uiAmount ?? 0;
    const bb = b.account.data.parsed.info.tokenAmount.uiAmount ?? 0;
    return bb - ba;
  });
  const ENRICH = 24;
  const enriched = await Promise.all(
    held.slice(0, ENRICH).map(async (acc) => {
      const mint = acc.account.data.parsed.info.mint;
      const ui = acc.account.data.parsed.info.tokenAmount.uiAmount ?? 0;
      const pair = await fetchBestSolanaPair(mint).catch(() => null);
      const price = pair?.priceUsd ? Number(pair.priceUsd) : null;
      const liquidity = pair?.liquidity?.usd ?? null;
      const ch5 = pair?.priceChange?.m5 ?? null;
      const ch24 = pair?.priceChange?.h24 ?? null;
      return {
        mint,
        symbol: pair?.baseToken.symbol ?? null,
        name: pair?.baseToken.name ?? null,
        image: pair?.info?.imageUrl ?? null,
        balance: ui,
        price_usd: price,
        value_usd: price ? price * ui : null,
        liquidity_usd: liquidity,
        price_change_5m: ch5,
        price_change_24h: ch24,
      };
    }),
  );

  // Per-holding risk (0..100). Heuristic, cheap, derived from data we
  // already pulled. Each contributor maxes at +X, capped at 100. Reasons
  // are collected so the UI can show "why" alongside the score.
  type Risk = {
    score: number;
    reasons: string[];
  };
  const positions = enriched.map((h) => {
    const r: Risk = { score: 0, reasons: [] };
    if (h.price_usd == null) {
      r.score += 35;
      r.reasons.push("no active DEX pair (illiquid)");
    }
    if (h.liquidity_usd != null && h.liquidity_usd < 25_000) {
      r.score += 25;
      r.reasons.push(`tiny liquidity ($${humanizeShort(h.liquidity_usd)})`);
    }
    if (h.price_change_24h != null && h.price_change_24h < -50) {
      r.score += 25;
      r.reasons.push(`down ${Math.round(h.price_change_24h)}% in 24h`);
    }
    if (h.price_change_24h != null && h.price_change_24h > 500) {
      r.score += 15;
      r.reasons.push(`parabolic +${Math.round(h.price_change_24h)}% in 24h`);
    }
    if (h.price_change_5m != null && h.price_change_5m < -25) {
      r.score += 15;
      r.reasons.push(`dumping in 5m`);
    }
    if (h.symbol == null) {
      r.score += 10;
      r.reasons.push("no DexScreener metadata");
    }
    if (r.score > 100) r.score = 100;
    return { ...h, risk_score: r.score, reasons: r.reasons };
  });

  // Aggregate risk: USD-weighted. Positions without USD value get a flat
  // floor weight of $1 so they still count without dominating.
  const totalUsd = positions.reduce(
    (acc, p) => acc + (p.value_usd ?? 1),
    0,
  );
  const weightedRisk =
    totalUsd > 0
      ? positions.reduce(
          (acc, p) => acc + p.risk_score * ((p.value_usd ?? 1) / totalUsd),
          0,
        )
      : 0;
  const aggregate_risk = Math.round(weightedRisk);

  // Top flagged: 3 worst by risk_score (with reasons).
  const top_flagged = positions
    .filter((p) => p.risk_score >= 25)
    .sort((a, b) => b.risk_score - a.risk_score)
    .slice(0, 3);

  // Smart-money overlap: which KOLs hold the same mints we do? We use
  // a set lookup so the cost is O(n+m) regardless of count.
  const ownedMints = new Set(positions.map((p) => p.mint));
  const overlap = kol
    .map((k) => {
      const shared = k.mints.filter((m) => ownedMints.has(m.mint));
      return {
        kol: k.name,
        kol_address: k.address,
        shared: shared.map((m) => ({
          mint: m.mint,
          symbol:
            m.symbol ??
            positions.find((p) => p.mint === m.mint)?.symbol ??
            null,
        })),
      };
    })
    .filter((entry) => entry.shared.length > 0)
    .sort((a, b) => b.shared.length - a.shared.length);

  const total_value_usd = positions.reduce(
    (acc, p) => acc + (p.value_usd ?? 0),
    0,
  );

  return NextResponse.json(
    {
      address,
      sol_balance: solBalance,
      total_value_usd,
      position_count: positions.length,
      recoverable_sol,
      empty_account_count: emptyCount,
      aggregate_risk,
      verdict: verdictFor(aggregate_risk),
      top_flagged,
      smart_overlap: overlap,
    },
    { headers: { "cache-control": "private, max-age=20" } },
  );
}

function humanizeShort(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(0) + "K";
  return n.toFixed(0);
}

function verdictFor(
  risk: number,
): "safe" | "cautious" | "loaded" | "danger" {
  if (risk < 20) return "safe";
  if (risk < 45) return "cautious";
  if (risk < 70) return "loaded";
  return "danger";
}
