import Anthropic from "@anthropic-ai/sdk";
import fs from "node:fs";
import path from "node:path";

/**
 * Read ANTHROPIC_API_KEY robustly. Prefer process.env (standard path), but
 * fall back to direct .env.local parsing, Turbopack's env loader has been
 * observed to silently produce an empty string for specific values that
 * contain mixed-case base64-style sequences. Direct parse bypasses the issue.
 */
function readApiKey(): string {
  const envVal = process.env.ANTHROPIC_API_KEY ?? "";
  if (envVal && envVal.length > 20) return envVal;
  try {
    const envFile = path.join(process.cwd(), ".env.local");
    const text = fs.readFileSync(envFile, "utf8");
    const m = text.match(/^\s*ANTHROPIC_API_KEY\s*=\s*["']?([^\s"'#]+)/m);
    if (m && m[1]) return m[1];
  } catch {
    /* file not readable, production env should already have it */
  }
  return envVal;
}

const apiKey = readApiKey();

let client: Anthropic | null = null;
function getClient(): Anthropic | null {
  if (!apiKey) return null;
  if (!client) client = new Anthropic({ apiKey });
  return client;
}

// Haiku 4.5 instead of Sonnet 4.5 — same prompt engineering, ~4x cheaper
// input + output ($0.80/$4 per 1M vs $3/$15). The work SolBeat asks the
// model to do is JSON-shape compliance + brand-voice prose, both well
// within Haiku's ceiling. The Sonnet bill on May 11 (~1.36M input tokens
// uncached, 0% cache rate) made the change non-optional.
export const SOLBEAT_MODEL = "claude-haiku-4-5-20251001";

/**
 * Run a single non-streaming Claude call. Returns raw text or null on failure.
 * Caller is responsible for prompts and parsing.
 *
 * Prompt caching is on by default — the system prompt is wrapped with
 * `cache_control: ephemeral` so repeated calls within ~5 min get 90% off
 * the cached portion. Combined with the Haiku rate this should drop the
 * input bill ~85% on a typical hour of token-page traffic.
 */
export async function runClaude(opts: {
  system: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
  model?: string;
}): Promise<string | null> {
  const c = getClient();
  if (!c) {
    const allKeys = Object.keys(process.env).filter((k) =>
      /(API_KEY|TOKEN|RPC|TREASURY|JUPITER|REDIS)/.test(k),
    );
    console.error(
      "[claude] no client. relevant env keys present:",
      allKeys,
      "ANTHROPIC head:",
      JSON.stringify((process.env.ANTHROPIC_API_KEY ?? "").slice(0, 14)),
      "PERPLEXITY head:",
      JSON.stringify((process.env.PERPLEXITY_API_KEY ?? "").slice(0, 8)),
    );
    return null;
  }
  try {
    const msg = await c.messages.create({
      model: opts.model ?? SOLBEAT_MODEL,
      max_tokens: opts.maxTokens ?? 1024,
      temperature: opts.temperature ?? 0.3,
      // System prompt as a structured TextBlockParam with cache_control
      // so Anthropic caches it across calls. The first call within a
      // 5-min window pays a 25% write-premium on the cached portion;
      // every subsequent call pays 10% of the normal input rate for
      // those tokens. For SolBeat, the synthesis + risk system prompts
      // are stable, so the cache hit rate should be near-100% on warm
      // production traffic.
      system: [
        {
          type: "text",
          text: opts.system,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content: opts.user }],
    });
    const block = msg.content.find((b) => b.type === "text");
    if (block && block.type === "text") return block.text;
    console.error("[claude] no text block in response", JSON.stringify(msg.content).slice(0, 200));
    return null;
  } catch (err) {
    console.error(
      "[claude] failed:",
      err instanceof Error ? `${err.name}: ${err.message}` : err,
    );
    return null;
  }
}

export function isAnthropicConfigured(): boolean {
  return !!apiKey;
}
