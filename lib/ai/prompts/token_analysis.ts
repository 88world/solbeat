import type {
  TokenMetadata,
  TokenMarket,
  TokenHolders,
  TweetSnippet,
  CatalystItem,
  TokenSynthesis,
} from "@/types/token";
import { runClaude } from "@/lib/ai/claude";
import { loadSystemPrompt } from "@/lib/ai/load-prompt";

/**
 * The token-analysis system prompt lives in the env var
 * `CLAUDE_SYSTEM_PROMPT_TOKEN_ANALYSIS` and is loaded at call time.
 * See lib/ai/load-prompt.ts for why prompts are out-of-source.
 */
const SYSTEM_PROMPT_KEY = "CLAUDE_SYSTEM_PROMPT_TOKEN_ANALYSIS";

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
  // Pull the system prompt from env at call time. Missing env →
  // gracefully return null so the UI shows "AI synthesis unavailable"
  // rather than calling Claude with an empty system message.
  const system = loadSystemPrompt(SYSTEM_PROMPT_KEY);
  if (!system) return null;

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
    system,
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
      what_this_is: stripEmDashes(obj.what_this_is),
      whats_happening: stripEmDashes(obj.whats_happening),
      what_to_know: stripEmDashes(obj.what_to_know),
    };
  } catch {
    return null;
  }
}

/**
 * Defensive em-dash stripper. The system prompt forbids em dashes but Claude
 * (and Perplexity) still slip them in occasionally because they're a deeply
 * trained typographic habit. We replace " — " with ". " (sentence break) and
 * any leftover bare "—" with ", ". This runs on every AI-generated string
 * the user will read.
 */
function stripEmDashes(s: string): string {
  return s
    .replace(/\s+—\s+/g, ". ")
    .replace(/—/g, ", ")
    .replace(/,\s*\./g, ".") // collapse ", ." artifacts from chained replacements
    .replace(/\s+/g, " ")
    .trim();
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
