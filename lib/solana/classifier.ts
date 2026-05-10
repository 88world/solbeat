/**
 * Holder classifier. Turns a list of "top 20 holders" from raw addresses
 * into something a degen can actually read at a glance:
 *
 *   "Raydium pool"      vs an opaque BHvYz…
 *   "Burn address"      vs an opaque 1nc1n…
 *   "CEX · Binance"     vs 5tzFk…
 *   "Whale"             5%+ of supply, no known label, established token
 *   "Sniper · 8h-old"   non-program holder of a token whose pool is <24h old
 *   "Fresh"             default for unclassified retail
 *
 * Reads matter: clicking through to Solscan to figure out who owns 12% of
 * a token is friction the user shouldn't have to do.
 */

export type HolderTag =
  | { kind: "lp"; label: string }
  | { kind: "program"; label: string }
  | { kind: "burn"; label: string }
  | { kind: "cex"; label: string }
  | { kind: "stake"; label: string }
  | { kind: "whale"; label: string }
  | { kind: "sniper"; label: string }
  | { kind: "fresh"; label: string };

/**
 * Static map of well-known program / pool / CEX / burn addresses on Solana.
 * Add to this freely, classification is the cheapest UX win in the app.
 */
const KNOWN: Record<string, { kind: HolderTag["kind"]; label: string }> = {
  // ── DEX programs / AMM authorities ───────────────────────────────────
  "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8": { kind: "program", label: "Raydium AMM" },
  "CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK": { kind: "program", label: "Raydium CLMM" },
  "CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C": { kind: "program", label: "Raydium CPMM" },
  whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc: { kind: "program", label: "Orca Whirlpool" },
  "9W959DqEETiGZocYWCQPaJ6sBmUzgfxXfqGeTEdp3aQP": { kind: "program", label: "Orca Pool" },
  LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo: { kind: "program", label: "Meteora DLMM" },
  Eo7WjKq67rjJQSZxS6z3YkapzY3eMj6Xy8X5EQVn5UaB: { kind: "program", label: "Meteora Pool" },
  "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P": { kind: "program", label: "Pump.fun" },
  pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA: { kind: "program", label: "Pump AMM" },
  JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4: { kind: "program", label: "Jupiter v6" },
  JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB: { kind: "program", label: "Jupiter v4" },

  // ── Token program / system / ATA ─────────────────────────────────────
  TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA: { kind: "program", label: "Token Program" },
  TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb: { kind: "program", label: "Token-2022" },
  "11111111111111111111111111111111": { kind: "program", label: "System Program" },
  ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL: { kind: "program", label: "Associated Token" },

  // ── Burn / dead addresses ────────────────────────────────────────────
  "1nc1nerator11111111111111111111111111111111": { kind: "burn", label: "Burn 🔥" },
  // Sometimes folks send to system program addr 0 too; treat as burn.

  // ── Liquid staking / stake pools ─────────────────────────────────────
  MarBmsSgKXdrN1egZf5sqe1TMThczhMLJhHB7AZB6Bg: { kind: "stake", label: "Marinade" },
  Stake11111111111111111111111111111111111111: { kind: "program", label: "Stake Program" },
  jitoMxxxjzNwzvVnggZyXKdTCSbDVsDcYUgRbCpVfQX: { kind: "stake", label: "Jito Stake" },

  // ── Major CEX hot wallets (known publicly via Arkham/Etherscan) ──────
  "5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi9": { kind: "cex", label: "CEX · Binance" },
  "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM": { kind: "cex", label: "CEX · Binance" },
  "2ojv9BAiHUrvsm9gxDe7fJSzbNZSJcxZvf8dqmWGHG8S": { kind: "cex", label: "CEX · Binance" },
  H8sMJSCQxfKiFTCfDR3DUMLPwcRbM61LGFJ8N4dK3WjS: { kind: "cex", label: "CEX · Binance" },
  "9un5wqE3q4oCjyrDkwsdD48KteCJitQX5978Vh7KKxHo": { kind: "cex", label: "CEX · OKX" },
  AC5RDfQFmDS1deWZos921JfqscXdByf8BKHs5ACWjtW2: { kind: "cex", label: "CEX · Bybit" },
  FWznbcNXWQuHTawe9RxvQ2LdCENssh12dsznf4RiouN5: { kind: "cex", label: "CEX · Kraken" },
  GhP1guYXcG4iz7BUqcCJYcG4iz7BUqcCJYcG4iz7BUq: { kind: "cex", label: "CEX · Kucoin" },
  "5VCwKtCXgCJ6kit5FybXjvriW3xELsFDhYrPSqtJNmcD": { kind: "cex", label: "CEX · Coinbase" },
  ASTyfSima4LLAdDgoFGkgqoKowG1LZFDr9fAQrg7iaJZ: { kind: "cex", label: "CEX · Mexc" },
};

export type ClassifyContext = {
  /** Holding as a percent of total supply (0..100). */
  pct: number;
  /** Pool/token age in hours, when known. */
  ageHours: number | null;
};

/**
 * Classify an OWNER address (not a token-account address). Returns the
 * sharpest tag we can derive from public information:
 *   - exact match in KNOWN  → use that
 *   - >5% holding           → "whale"
 *   - pool <24h old + non-program holder → "sniper"
 *   - default               → "fresh"
 */
export function classifyOwner(
  owner: string,
  ctx: ClassifyContext,
): HolderTag {
  const known = KNOWN[owner];
  if (known) return { kind: known.kind, label: known.label };

  // Burn-pattern check: addresses with 1nc1nerator-like prefixes.
  if (owner.startsWith("1nc1n") || owner === "11111111111111111111111111111111") {
    return { kind: "burn", label: "Burn 🔥" };
  }

  if (ctx.pct >= 5) {
    return { kind: "whale", label: "Whale" };
  }
  if (ctx.ageHours != null && ctx.ageHours < 24) {
    return { kind: "sniper", label: `Sniper · ${Math.round(ctx.ageHours)}h pool` };
  }
  return { kind: "fresh", label: "Holder" };
}

/** Color map for rendering. Mirrors the severity vocabulary used elsewhere. */
export function tagStyle(kind: HolderTag["kind"]): { bg: string; color: string } {
  switch (kind) {
    case "lp":
    case "program":
      return { bg: "rgba(94, 92, 255, 0.10)", color: "#5e5cff" };
    case "burn":
      return { bg: "rgba(255, 139, 45, 0.12)", color: "#d6601a" };
    case "cex":
      return { bg: "rgba(20, 241, 149, 0.10)", color: "#0a8f57" };
    case "stake":
      return { bg: "rgba(20, 241, 149, 0.10)", color: "#0a6f47" };
    case "whale":
      return { bg: "rgba(193, 55, 74, 0.10)", color: "#c1374a" };
    case "sniper":
      return { bg: "rgba(214, 96, 26, 0.10)", color: "#d6601a" };
    case "fresh":
    default:
      return { bg: "rgba(10, 10, 30, 0.05)", color: "#5a5a70" };
  }
}
