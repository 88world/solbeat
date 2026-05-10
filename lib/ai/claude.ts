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

export const SOLBEAT_MODEL = "claude-sonnet-4-5-20250929";

/**
 * Run a single non-streaming Claude call. Returns raw text or null on failure.
 * Caller is responsible for prompts and parsing.
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
