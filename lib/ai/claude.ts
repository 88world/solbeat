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
 * Earlier this wrapper used the structured `system: [{ type, text,
 * cache_control: { type: "ephemeral" } }]` form to opt into Anthropic
 * prompt caching. That broke synthesis on Haiku 4.5 — the cached block
 * must meet a minimum-token threshold the SolBeat prompts (~225-460
 * tokens) don't reach, and Anthropic returns a 400 cache_control_invalid
 * error that this wrapper's catch block was swallowing. Reverted to a
 * plain string system param. The Haiku rate alone (4x cheaper than
 * Sonnet) + Upstash caching on the orchestrator (2-24h TTLs) carries
 * the cost reduction; we can revisit prompt caching once the system
 * prompts grow past the minimum threshold.
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
      system: opts.system,
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
