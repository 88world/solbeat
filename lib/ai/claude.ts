import Anthropic from "@anthropic-ai/sdk";

const apiKey = process.env.ANTHROPIC_API_KEY;

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
  if (!c) return null;
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
    return null;
  } catch (err) {
    console.error("[claude] failed", err);
    return null;
  }
}

export function isAnthropicConfigured(): boolean {
  return !!apiKey;
}
