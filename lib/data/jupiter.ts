import { FEES, SOL_MINT } from "@/config/constants";

const QUOTE_BASE = "https://quote-api.jup.ag/v6";
const PRICE_BASE = "https://price.jup.ag/v6";

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
      headers: { "content-type": "application/json" },
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
    const r = await fetch(`${PRICE_BASE}/price?ids=${mint}`, {
      next: { revalidate: 30 },
    });
    if (!r.ok) return null;
    const json = (await r.json()) as { data?: Record<string, { price?: number }> };
    return json.data?.[mint]?.price ?? null;
  } catch {
    return null;
  }
}
