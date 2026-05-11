import type { CatalystItem } from "@/types/token";
import { LIMITS, TTL } from "@/config/constants";
import { loadSystemPrompt } from "@/lib/ai/load-prompt";
import { cached } from "@/lib/cache/redis";

const PPLX_KEY = process.env.PERPLEXITY_API_KEY ?? "";

/**
 * The catalyst-extraction system prompt lives in the env var
 * `PERPLEXITY_SYSTEM_PROMPT_CATALYSTS` and is loaded at call time.
 * See lib/ai/load-prompt.ts for why prompts are out-of-source.
 */
const SYSTEM_PROMPT_KEY = "PERPLEXITY_SYSTEM_PROMPT_CATALYSTS";

type PplxMessage = { role: "system" | "user" | "assistant"; content: string };

type PplxResponse = {
  choices: Array<{ message: { content: string } }>;
  citations?: string[];
  search_results?: Array<{ title?: string; url?: string }>;
};

/**
 * Pull live news + sentiment for a Solana token.
 *
 * The system prompt asks the model to return STRUCTURED catalysts (title +
 * summary + reference number per item) so we can render them as proper cards
 * instead of raw markdown headers. We then normalize aggressively:
 *   - drop markdown header lines (`#`, `##`)
 *   - strip `[^N]` reference markers and `**bold**` syntax
 *   - extract a real title (the bold or first sentence) per fact
 *   - resolve source labels from the citation hostname (never expose the
 *     research vendor's name)
 */
/**
 * Cached by CA at TTL.CATALYSTS_S (1h). Catalysts are 24h-window summaries,
 * so caching the same answer for an hour keeps the data within the source
 * window's validity. Saves Perplexity API credits on every repeat visit.
 */
export async function fetchCatalysts(
  symbol: string,
  ca: string,
): Promise<CatalystItem[]> {
  return cached(`catalysts:${ca}`, TTL.CATALYSTS_S, () =>
    fetchCatalystsUncached(symbol, ca),
  );
}

async function fetchCatalystsUncached(
  symbol: string,
  ca: string,
): Promise<CatalystItem[]> {
  if (!PPLX_KEY) return [];

  // System prompt is loaded from env at call time. Missing prompt →
  // gracefully return [] so the Catalysts panel just shows "no
  // catalysts" rather than crashing or sending an empty system.
  const system = loadSystemPrompt(SYSTEM_PROMPT_KEY);
  if (!system) return [];

  const messages: PplxMessage[] = [
    { role: "system", content: system },
    {
      role: "user",
      content:
        `Solana token: ${symbol} (CA: ${ca}). What has driven price action in the last 24 hours? ` +
        `List 3-5 concrete catalysts: announcements, integrations, influencer mentions, on-chain events. ` +
        `Each must be specific and verifiable.`,
    },
  ];

  try {
    const r = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PPLX_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "sonar",
        messages,
        max_tokens: 500,
        temperature: 0.2,
      }),
    });
    if (!r.ok) return [];
    const json = (await r.json()) as PplxResponse;
    const text = json.choices?.[0]?.message?.content ?? "";
    const citations = json.citations ?? [];
    const results = json.search_results ?? [];

    return parseCatalysts(text, citations, results);
  } catch {
    return [];
  }
}

/**
 * Parse Perplexity's markdown reply into clean catalyst cards.
 * Splits on blank lines (between items), then pulls a title (first line,
 * stripped of bold) and a summary (joined remaining lines). Strips reference
 * markers and citation noise.
 */
function parseCatalysts(
  text: string,
  citations: string[],
  results: Array<{ title?: string; url?: string }>,
): CatalystItem[] {
  // Drop markdown headers, intro/outro paragraphs, and trailing whitespace.
  const cleanedText = text
    .split("\n")
    .filter((line) => !/^#{1,6}\s/.test(line.trim())) // drop "# Title"
    .join("\n")
    .trim();

  // Split into items on blank lines.
  const blocks = cleanedText.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);

  const items: CatalystItem[] = [];
  for (const block of blocks) {
    const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) continue;

    // First line: title. Strip leading bullets/dashes/numbers and **bold**.
    const rawTitle = stripEmDashes(
      lines[0]
        .replace(/^[-*\d.)\s]+/, "")
        .replace(/\*\*(.+?)\*\*/g, "$1")
        .replace(/\[\^?\d+\]/g, ""),
    );

    // Remaining lines = summary.
    const summary = stripEmDashes(
      lines
        .slice(1)
        .join(" ")
        .replace(/\*\*(.+?)\*\*/g, "$1")
        .replace(/\[\^?(\d+)\]/g, "") // strip [^1], [1]
        .replace(/^[-*]\s+/, "")
        .replace(/\s+/g, " "),
    );

    // Single-line variant: treat the whole block as the summary, derive title
    // from the first ~6 words.
    const finalTitle = summary && rawTitle && rawTitle !== summary
      ? rawTitle
      : firstNWords(rawTitle || summary || block, 8);
    const finalSummary = summary || rawTitle;
    if (!finalSummary || finalSummary.length < 25) continue;

    // Pick a citation: prefer search_results matched by reference number,
    // else use the Nth citation URL, else null.
    const refMatch = block.match(/\[\^?(\d+)\]/);
    const refIdx = refMatch ? Number(refMatch[1]) - 1 : items.length;
    const result = results[refIdx];
    const url = result?.url ?? citations[refIdx] ?? null;
    const sourceHost = url ? hostname(url) : null;

    items.push({
      source: sourceHost ?? "live",
      title: cleanTitle(finalTitle),
      url,
      summary: finalSummary,
    });
    if (items.length >= LIMITS.CATALYSTS_FOR_SYNTHESIS) break;
  }

  return items;
}

function firstNWords(s: string, n: number): string {
  return s.split(/\s+/).slice(0, n).join(" ");
}

/**
 * Strips em dashes from AI text. Hard rule, the system prompt forbids them
 * but Perplexity slips them in anyway because it's a deeply trained habit.
 *   " — "  → ". " (sentence break, the most common case)
 *   "—"    → ", " (any remaining bare em dashes)
 */
function stripEmDashes(s: string): string {
  return s
    .replace(/\s+—\s+/g, ". ")
    .replace(/—/g, ", ")
    .replace(/,\s*\./g, ".") // collapse ", ." artifacts
    .replace(/\s+/g, " ")
    .trim();
}

function cleanTitle(s: string): string {
  return s
    .replace(/[*_`]+/g, "")
    .replace(/\s+/g, " ")
    .replace(/\s*[—\-:]+\s*$/, "")
    .trim();
}

function hostname(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}
