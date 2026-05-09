import bs58 from "bs58";

const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]+$/;

export function isValidSolanaAddress(input: string): boolean {
  const trimmed = input.trim();
  if (trimmed.length < 32 || trimmed.length > 44) return false;
  if (!BASE58_RE.test(trimmed)) return false;
  try {
    const decoded = bs58.decode(trimmed);
    return decoded.length === 32;
  } catch {
    return false;
  }
}

/**
 * Determine what kind of input the user pasted.
 * - "ca": valid Solana address treated as token mint (cannot easily distinguish CA vs wallet without RPC)
 * - "ticker": $XYZ or short uppercase string
 * - "invalid": anything else
 */
export type ParsedInput =
  | { kind: "address"; value: string }
  | { kind: "ticker"; value: string }
  | { kind: "invalid"; reason: string };

export function parseInput(raw: string): ParsedInput {
  const trimmed = raw.trim();
  if (!trimmed) return { kind: "invalid", reason: "empty" };

  // $TICKER form
  if (trimmed.startsWith("$")) {
    const sym = trimmed.slice(1).toUpperCase();
    if (sym.length >= 2 && sym.length <= 10 && /^[A-Z0-9]+$/.test(sym)) {
      return { kind: "ticker", value: sym };
    }
    return { kind: "invalid", reason: "bad ticker" };
  }

  // Solana address
  if (isValidSolanaAddress(trimmed)) {
    return { kind: "address", value: trimmed };
  }

  // Plain TICKER (no $)
  if (/^[A-Za-z0-9]{2,10}$/.test(trimmed)) {
    return { kind: "ticker", value: trimmed.toUpperCase() };
  }

  return { kind: "invalid", reason: "unrecognized format" };
}
