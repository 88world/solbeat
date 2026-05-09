import type { CatalystItem } from "@/types/token";
import { LIMITS } from "@/config/constants";

const PPLX_KEY = process.env.PERPLEXITY_API_KEY ?? "";

type PplxMessage = { role: "system" | "user" | "assistant"; content: string };

type PplxResponse = {
  choices: Array<{ message: { content: string } }>;
  citations?: string[];
  search_results?: Array<{ title?: string; url?: string }>;
};

export async function fetchCatalysts(
  symbol: string,
  ca: string,
): Promise<CatalystItem[]> {
  if (!PPLX_KEY) return [];

  const messages: PplxMessage[] = [
    {
      role: "system",
      content:
        "You research what is currently driving price action for a specific Solana cryptocurrency token. You return facts with citations. No speculation, no price predictions, no shilling.",
    },
    {
      role: "user",
      content: `What has been said about the Solana token ${symbol} (contract: ${ca}) on X/Twitter and crypto news sites in the last 24 hours? Focus on: (1) any specific catalysts or announcements, (2) influential accounts that have mentioned it, (3) general sentiment direction. Return 3-5 specific facts. Do not include price predictions.`,
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
        model: "sonar-pro",
        messages,
        max_tokens: 600,
        temperature: 0.2,
      }),
    });
    if (!r.ok) return [];
    const json = (await r.json()) as PplxResponse;
    const text = json.choices?.[0]?.message?.content ?? "";
    const citations = json.citations ?? [];
    const results = json.search_results ?? [];

    // Split by lines/bullets and pair with citations.
    const facts = text
      .split(/\n+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 30 && /[a-z]/i.test(s))
      .slice(0, LIMITS.CATALYSTS_FOR_SYNTHESIS);

    return facts.map<CatalystItem>((summary, i) => {
      const citationUrl = citations[i] ?? null;
      const result = results[i];
      return {
        source: result?.title ?? hostname(citationUrl ?? "") ?? "Perplexity",
        title: result?.title ?? "",
        url: result?.url ?? citationUrl ?? null,
        summary: summary.replace(/^[\-\*\d\.\s]+/, ""),
      };
    });
  } catch {
    return [];
  }
}

function hostname(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}
