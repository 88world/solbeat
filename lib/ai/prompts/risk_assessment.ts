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
  const cleaned = raw.trim().replace(/^```json\s*/i, "").replace(/^```/i, "").replace(/```$/i, "");
  try {
    const obj = JSON.parse(cleaned) as RiskScore;
    if (typeof obj.score !== "number") return null;
    return obj;
  } catch {
    return null;
  }
}

export function computeHeuristicRisk(
  a: Pick<TokenAnalysis, "metadata" | "market" | "holders">,
): RiskScore {
  const liq = a.market.liquidity_usd ?? 0;
  const liquidity = liq < 5_000 ? 95 : liq < 25_000 ? 75 : liq < 100_000 ? 45 : liq < 500_000 ? 25 : 10;

  const top1 = a.holders.top_1_pct ?? 0;
  const top10 = a.holders.top_10_pct ?? 0;
  const holders = Math.min(100, Math.max(top1 > 25 ? 70 : 0, top10 > 50 ? 70 : Math.min(top10, 60)));

  const authorities = a.metadata.mint_authority
    ? 95
    : a.metadata.freeze_authority
      ? 80
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

  const vol = a.market.volume_24h ?? 0;
  const ratio = liq > 0 ? vol / liq : 0;
  const volume_quality = ratio > 20 ? 80 : ratio > 10 ? 65 : ratio > 5 ? 35 : 15;

  const score = Math.round((liquidity + holders + authorities + age + volume_quality) / 5);
  const label =
    score >= 80 ? "EXTREME" :
    score >= 60 ? "HIGH" :
    score >= 40 ? "MODERATE" :
    score >= 20 ? "LOW" : "SAFE";

  const factors = { liquidity, holders, authorities, age, volume_quality };
  const top_concern = pickTopConcern(factors);

  return { score, label, factors, top_concern };
}

function pickTopConcern(f: RiskScore["factors"]): string {
  const entries = Object.entries(f) as [keyof RiskScore["factors"], number][];
  const [worst] = entries.sort((a, b) => b[1] - a[1]);
  switch (worst[0]) {
    case "liquidity": return "Thin liquidity — even small sells can move the price meaningfully.";
    case "holders": return "Concentrated holders — a single wallet exit could collapse the price.";
    case "authorities": return "Active mint or freeze authority — supply and account state are not guaranteed fixed.";
    case "age": return "Very young pool — too early to read sustainable demand.";
    case "volume_quality": return "Volume-to-liquidity ratio looks like wash trading rather than organic interest.";
    default: return "Multiple moderate risk factors — read the full analysis.";
  }
}
