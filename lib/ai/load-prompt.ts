/**
 * Runtime loader for AI system prompts.
 *
 * Why prompts live in env vars and not in source:
 *
 * SolBeat is open source. The system prompts that drive Claude's token
 * synthesis, risk scoring, and Perplexity's catalyst extraction represent
 * a meaningful amount of prompt-engineering work (tone, refusal patterns,
 * output JSON shape, em-dash hard rule, etc.) and Block Valley Labs would
 * rather not ship that wording verbatim in a public repo.
 *
 * Anyone can fork SolBeat, set their own keys + their own prompts, and
 * run their own analyst. The codebase itself contains *no* proprietary
 * prompt content.
 *
 * When the env var is missing we return `null` and the calling function
 * is expected to short-circuit gracefully (return null from the API
 * surface, render an "AI unavailable" placeholder, etc.). The site still
 * works without AI features.
 */
export function loadSystemPrompt(envKey: string): string | null {
  const v = process.env[envKey];
  if (!v || !v.trim()) {
    // Dev hint, never noisy in prod. The functions that depend on
    // this prompt will short-circuit and the UI degrades gracefully.
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        `[ai] system prompt env var "${envKey}" is not set. AI feature disabled. ` +
          `Set this in .env.local to enable (see .env.example for the list of keys).`,
      );
    }
    return null;
  }
  return v;
}
