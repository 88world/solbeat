import { FEES, SOL_MINT } from "@/config/constants";

// Jupiter API migration: quote-api.jup.ag/v6 was deprecated end of Sept 2025.
// Free tier now lives at lite-api.jup.ag/swap/v1 (also being phased out
// eventually in favor of api.jup.ag with a key — no firm date). Lite
// works without auth so we ship with that as the default. If
// JUPITER_API_KEY is set in env we use the paid api.jup.ag.
const JUP_API_KEY = process.env.JUPITER_API_KEY;
const QUOTE_BASE = JUP_API_KEY
  ? "https://api.jup.ag/swap/v1"
  : "https://lite-api.jup.ag/swap/v1";
const PRICE_BASE = JUP_API_KEY
  ? "https://api.jup.ag/price/v3"
  : "https://lite-api.jup.ag/price/v3";

const jupHeaders: Record<string, string> = JUP_API_KEY
  ? { "x-api-key": JUP_API_KEY }
  : {};

export type JupiterQuote = {
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: "ExactIn" | "ExactOut";
  priceImpactPct: string;
  slippageBps: number;
  routePlan: Array<{ swapInfo: { label: string } }>;
};

export async function getQuote(opts: {
  inputMint?: string;
  outputMint: string;
  amountLamports: number;
  slippageBps?: number;
}): Promise<JupiterQuote | null> {
  const inputMint = opts.inputMint ?? SOL_MINT;
  const slippage = opts.slippageBps ?? 50;
  const params = new URLSearchParams({
    inputMint,
    outputMint: opts.outputMint,
    amount: String(opts.amountLamports),
    slippageBps: String(slippage),
    platformFeeBps: String(FEES.JUPITER_PLATFORM_BPS),
  });
  try {
    const r = await fetch(`${QUOTE_BASE}/quote?${params.toString()}`, {
      headers: jupHeaders,
      next: { revalidate: 0 },
    });
    if (!r.ok) return null;
    return (await r.json()) as JupiterQuote;
  } catch {
    return null;
  }
}

export async function getSwapTransaction(opts: {
  quote: JupiterQuote;
  userPublicKey: string;
  feeAccount?: string;
}): Promise<{ swapTransaction: string } | null> {
  try {
    const r = await fetch(`${QUOTE_BASE}/swap`, {
      method: "POST",
      headers: { "content-type": "application/json", ...jupHeaders },
      body: JSON.stringify({
        quoteResponse: opts.quote,
        userPublicKey: opts.userPublicKey,
        wrapAndUnwrapSol: true,
        ...(opts.feeAccount ? { feeAccount: opts.feeAccount } : {}),
      }),
    });
    if (!r.ok) return null;
    return (await r.json()) as { swapTransaction: string };
  } catch {
    return null;
  }
}

export async function fetchPrice(mint: string): Promise<number | null> {
  try {
    const r = await fetch(`${PRICE_BASE}?ids=${mint}`, {
      headers: jupHeaders,
      next: { revalidate: 30 },
    });
    if (!r.ok) return null;
    // Price v3 shape: { [mint]: { usdPrice: number, ... } }
    const json = (await r.json()) as Record<
      string,
      { usdPrice?: number; price?: number }
    >;
    const entry = json[mint];
    return entry?.usdPrice ?? entry?.price ?? null;
  } catch {
    return null;
  }
}
