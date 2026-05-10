import type {
  TokenMetadata,
  TokenMarket,
  TokenHolders,
  TweetSnippet,
  CatalystItem,
  TokenSynthesis,
} from "@/types/token";
import { runClaude } from "@/lib/ai/claude";

export const TOKEN_ANALYSIS_SYSTEM = `You are SolBeat, an AI analyst that turns Solana token data into clear, honest, plain-English reads for crypto traders. You write the way a senior trader would explain a token to a friend over a beer — direct, useful, no jargon when plain words will do, no hedging when the data is clear. You never shill, you never moralize, you tell the user what's actually happening and what they should watch out for.

You will receive a JSON payload with on-chain data, recent tweets, and recent news for a Solana token. Your job is to write exactly three short sections in the JSON output below.

WHAT_THIS_IS — origin, supply, age, deployer, holder structure. 2-3 sentences. Lead with the most distinguishing fact.

WHATS_HAPPENING — recent price action, volume changes, holder movement (accumulation/distribution), social sentiment direction, any catalyst from the news/tweets data. 3-4 sentences. Be specific about timeframes.

WHAT_TO_KNOW — the honest risks and signals. LP status, mint/freeze authority, holder concentration, age vs volume sustainability, any red flags. End with one direct line on what would change your read.

Rules:
- No emojis. No exclamation marks. No "to the moon" language.
- No price predictions or buy/sell recommendations.
- If data is missing, say so explicitly. Don't invent.
- If a token looks like a likely scam, say so plainly with the specific reasons.
- Use exact numbers when meaningful, rounded humanized numbers otherwise (e.g. "47% of supply" not "47.3284%").
- Total length: 180-260 words across all three sections combined.

Return ONLY a single JSON object with this exact shape and no other text:
{
  "what_this_is": "<2-3 sentences>",
  "whats_happening": "<3-4 sentences>",
  "what_to_know": "<2-3 sentences>"
}`;

export type TokenAnalysisInput = {
  metadata: TokenMetadata;
  market: TokenMarket;
  holders: TokenHolders;
  tweets: TweetSnippet[];
  catalysts: CatalystItem[];
};

export async function generateTokenSynthesis(
  input: TokenAnalysisInput,
): Promise<TokenSynthesis | null> {
  const compactPayload = {
    ca: input.metadata.ca,
    metadata: {
      name: input.metadata.name,
      symbol: input.metadata.symbol,
      decimals: input.metadata.decimals,
      supply: input.metadata.supply,
      mint_authority_active: !!input.metadata.mint_authority,
      freeze_authority_active: !!input.metadata.freeze_authority,
      is_mutable: input.metadata.is_mutable,
      age_hours: input.metadata.age_hours,
    },
    market: input.market,
    holders: {
      top_1_pct: input.holders.top_1_pct,
      top_10_pct: input.holders.top_10_pct,
      sample_size: input.holders.top_20.length,
    },
    tweets: input.tweets.slice(0, 25).map((t) => ({
      handle: t.handle,
      followers: t.followers,
      text: t.text.slice(0, 220),
      engagement: t.engagement,
      age_minutes: t.age_minutes,
    })),
    catalysts: input.catalysts.slice(0, 6).map((c) => ({
      source: c.source,
      title: c.title,
      summary: c.summary.slice(0, 280),
    })),
  };

  const text = await runClaude({
    system: TOKEN_ANALYSIS_SYSTEM,
    user: `Analyze this Solana token:\n\n${JSON.stringify(compactPayload, null, 2)}\n\nReturn only the JSON object.`,
    maxTokens: 1200,
    temperature: 0.3,
  });

  if (!text) {
    console.error("[synthesis] runClaude returned null");
    return null;
  }
  const result = parseSynthesis(text);
  if (!result) {
    console.error("[synthesis] parse failed. raw response:", text.slice(0, 500));
  }
  return result;
}

/**
 * Robust JSON extraction from a Claude response. Handles ```json fences,
 * leading prose ("Here's the analysis:"), trailing commentary, and stray
 * whitespace. Walks the string to find the first {…} object with proper
 * brace tracking (quote-aware) so braces inside string values don't confuse
 * it.
 */
function parseSynthesis(raw: string): TokenSynthesis | null {
  const jsonStr = extractFirstJsonObject(raw);
  if (!jsonStr) return null;
  try {
    const obj = JSON.parse(jsonStr) as Partial<TokenSynthesis>;
    if (!obj.what_this_is || !obj.whats_happening || !obj.what_to_know) {
      return null;
    }
    return {
      what_this_is: obj.what_this_is,
      whats_happening: obj.whats_happening,
      what_to_know: obj.what_to_know,
    };
  } catch {
    return null;
  }
}

export function extractFirstJsonObject(raw: string): string | null {
  const start = raw.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escapeNext = false;
  for (let i = start; i < raw.length; i++) {
    const ch = raw[i];
    if (escapeNext) {
      escapeNext = false;
      continue;
    }
    if (ch === "\\") {
      escapeNext = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        return raw.slice(start, i + 1);
      }
    }
  }
  return null;
}
