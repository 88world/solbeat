import type { RiskScore, TokenAnalysis } from "@/types/token";
import { runClaude } from "@/lib/ai/claude";

export const RISK_SYSTEM = `You assign risk scores to Solana tokens on a 0-100 scale where 0 is safest and 100 is highest risk. Return ONLY valid JSON in this exact shape, no other text:

{
  "score": <0-100 integer>,
  "label": "SAFE | LOW | MODERATE | HIGH | EXTREME",
  "factors": {
    "liquidity": <0-100>,
    "holders": <0-100>,
    "authorities": <0-100>,
    "age": <0-100>,
    "volume_quality": <0-100>
  },
  "top_concern": "<one sentence stating the single biggest risk factor>"
}

Scoring guidance:
- Liquidity: low LP USD value (under 25k) = 60+, very low or unlocked = 80+
- Holders: top wallet >25% = 70+, top 10 >50% = 60+
- Authorities: mint authority active = 90+, freeze authority active = 80+
- Age: <24h = 60+, <1 week = 40+
- Volume quality: 24h volume to liquidity ratio >10x = 70+ (wash trading signal)

Map total score to label: 0-19 SAFE, 20-39 LOW, 40-59 MODERATE, 60-79 HIGH, 80-100 EXTREME.`;

export async function generateRiskScore(
  analysis: Pick<TokenAnalysis, "metadata" | "market" | "holders">,
): Promise<RiskScore | null> {
  const payload = {
    metadata: analysis.metadata,
    market: analysis.market,
    holders: {
      top_1_pct: analysis.holders.top_1_pct,
      top_10_pct: analysis.holders.top_10_pct,
    },
  };

  // Heuristic baseline so we always have a score even if Claude fails.
  const baseline = computeHeuristicRisk(analysis);

  const text = await runClaude({
    system: RISK_SYSTEM,
    user: JSON.stringify(payload),
    maxTokens: 300,
    temperature: 0.1,
  });
  if (!text) return baseline;

  const parsed = parseRisk(text);
  return parsed ?? baseline;
}

function parseRisk(raw: string): RiskScore | null {
  const jsonStr = extractFirstJsonObject(raw);
  if (!jsonStr) return null;
  try {
    const obj = JSON.parse(jsonStr) as RiskScore;
    if (typeof obj.score !== "number") return null;
    return obj;
  } catch {
    return null;
  }
}

function extractFirstJsonObject(raw: string): string | null {
  const start = raw.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escapeNext = false;
  for (let i = start; i < raw.length; i++) {
    const ch = raw[i];
    if (escapeNext) { escapeNext = false; continue; }
    if (ch === "\\") { escapeNext = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return raw.slice(start, i + 1);
    }
  }
  return null;
}

export function computeHeuristicRisk(
  a: Pick<TokenAnalysis, "metadata" | "market" | "holders">,
): RiskScore {
  const liq = a.market.liquidity_usd ?? 0;
  const liquidity = liq < 5_000 ? 95 : liq < 25_000 ? 75 : liq < 100_000 ? 45 : liq < 500_000 ? 25 : 10;

  const top1 = a.holders.top_1_pct ?? 0;
  const top10 = a.holders.top_10_pct ?? 0;
  const holders = Math.min(100, Math.max(top1 > 25 ? 70 : 0, top10 > 50 ? 70 : Math.min(top10, 60)));

  // CONTEXT-AWARE authority risk. Flat "mint live = 95" was wrong for
  // tokens like BONK where the authority is held by a DAO multisig that
  // has not been used adversarially in 3 years. An active mint on a
  // 3yr+ pool with deep liquidity is meaningfully different from a fresh
  // dev wallet that minted yesterday.
  //
  // Discount tiers:
  //   >1yr + >$500k liq + >$100k 24h vol → 60% off mint risk (95 → 38)
  //   >180d + >$250k liq + >$50k 24h vol → 30% off (95 → 67)
  //   anything else                       → no discount
  // Freeze gets a smaller discount, freeze can lock balances in one tx
  // (less "track record forgiveness" than mint dilution).
  const ageH = a.metadata.age_hours ?? 0;
  const vol = a.market.volume_24h ?? 0;
  const veryEstablished = ageH > 24 * 365 && liq > 500_000 && vol > 100_000;
  const moderatelyEstablished =
    !veryEstablished && ageH > 24 * 180 && liq > 250_000 && vol > 50_000;
  const mintDiscount = veryEstablished ? 0.40 : moderatelyEstablished ? 0.70 : 1.0;
  const freezeDiscount = veryEstablished ? 0.65 : moderatelyEstablished ? 0.85 : 1.0;
  const authorities = a.metadata.mint_authority
    ? Math.round(95 * mintDiscount)
    : a.metadata.freeze_authority
      ? Math.round(80 * freezeDiscount)
      : 10;

  const age = a.metadata.age_hours == null
    ? 35
    : a.metadata.age_hours < 24
      ? 70
      : a.metadata.age_hours < 168
        ? 45
        : a.metadata.age_hours < 720
          ? 25
          : 10;

  const ratio = liq > 0 ? vol / liq : 0;
  const volume_quality = ratio > 20 ? 80 : ratio > 10 ? 65 : ratio > 5 ? 35 : 15;

  const score = Math.round((liquidity + holders + authorities + age + volume_quality) / 5);
  const label =
    score >= 80 ? "EXTREME" :
    score >= 60 ? "HIGH" :
    score >= 40 ? "MODERATE" :
    score >= 20 ? "LOW" : "SAFE";

  const factors = { liquidity, holders, authorities, age, volume_quality };
  const top_concern = pickTopConcern(factors, {
    veryEstablished,
    moderatelyEstablished,
    hasMint: !!a.metadata.mint_authority,
    hasFreeze: !!a.metadata.freeze_authority,
  });

  return { score, label, factors, top_concern };
}

function pickTopConcern(
  f: RiskScore["factors"],
  ctx: {
    veryEstablished: boolean;
    moderatelyEstablished: boolean;
    hasMint: boolean;
    hasFreeze: boolean;
  },
): string {
  const entries = Object.entries(f) as [keyof RiskScore["factors"], number][];
  const [worst] = entries.sort((a, b) => b[1] - a[1]);
  switch (worst[0]) {
    case "liquidity":
      return "Thin liquidity. Small sells move the price meaningfully.";
    case "holders":
      return "Concentrated holders. One wallet exit could collapse the price.";
    case "authorities":
      // Context-aware: established tokens with deep LP get the softer read.
      if (ctx.veryEstablished && ctx.hasMint) {
        return "Mint authority is set but the token has 1yr+ of clean track record and deep liquidity. Likely held by a DAO/multisig. Lower practical risk than the raw flag suggests.";
      }
      if (ctx.moderatelyEstablished && ctx.hasMint) {
        return "Mint authority is set on a 6mo+ token with healthy liquidity. Less alarming than on a fresh launch but still verify the holder.";
      }
      if (ctx.hasMint) {
        return "Mint authority active on a fresh token. Supply is not fixed, issuer can dilute holders at will.";
      }
      if (ctx.hasFreeze) {
        return "Freeze authority active. Issuer can lock any holder's balance with a single transaction.";
      }
      return "Authority concerns flagged.";
    case "age":
      return "Very young pool. Too early to read sustainable demand.";
    case "volume_quality":
      return "Volume-to-liquidity ratio looks like wash trading rather than organic interest.";
    default:
      return "Multiple moderate risk factors, read the full analysis.";
  }
}
