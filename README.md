# SolBeat

**The pulse of every Solana token, in plain English.**

SolBeat turns any Solana token contract into a one-paragraph human read. Paste a CA, see real-time on-chain data, X sentiment, and recent catalysts synthesized into plain English by an AI reasoning layer. Connect your wallet to see your portfolio's pulse and reclaim locked SOL from dead memecoin trades.

Built by [Block Valley Labs](https://blockvalley.io) for the Solana Frontier Hackathon (Colosseum).

## What it does

- **Token Intel.** Paste any Solana mint, get a 3-paragraph plain-English read powered by Claude Sonnet — what the token is, what's happening right now, and what to know. On-chain data + X sentiment + Perplexity-driven catalysts in one synthesis.
- **Risk Score.** Composite 0–100 score with breakdown across liquidity, holder concentration, mint/freeze authority, age, and volume quality. Heuristic baseline + AI refinement.
- **Wallet Pulse.** Connect Phantom / Solflare and see your portfolio at a glance.
- **Hidden SOL.** Find empty SPL token accounts holding rent SOL from dead trades. One signature reclaims the lot. We take 5%, you keep 95%.
- **Jupiter Swap.** Floating swap panel routes through Jupiter v6 with a 0.20% platform fee.
- **Trending Ring.** Cinematic rotating ring of trending Solana tokens on the hero, refreshed every minute from DexScreener.

## Stack

- **Next.js 16** (App Router) + **TypeScript** + **Tailwind v4**
- **Three.js** WebGL pulse sphere with vertex-shader displacement
- **Anthropic Claude Sonnet 4.5** for the reasoning layer
- **Helius** RPC for on-chain reads (DAS API for metadata)
- **Birdeye** for price + OHLCV
- **DexScreener** for pair / liquidity / trending
- **Perplexity sonar-pro** for catalyst synthesis with citations
- **twitterapi.io** for X sentiment scraping
- **Jupiter v6** for swap execution
- **@solana/wallet-adapter** for wallet connection
- **Upstash Redis** for caching (with in-memory fallback)

## Architecture

```
User pastes CA
   ↓
[Hero] /token/[ca]
   ↓
analyzeToken(ca) — Redis cache check
   ↓ (miss)
parallel fetch:
   ├─ Helius DAS getAsset           → metadata, supply, authorities
   ├─ Helius getTokenLargestAccounts → holder concentration
   ├─ DexScreener best Solana pair   → price, volume, liquidity, dex
   ├─ Birdeye token_overview         → price changes (1h/24h/7d), holders
   ├─ Perplexity sonar-pro           → recent news + sentiment with citations
   └─ twitterapi.io advanced_search  → 50 most recent tweets, ranked by engagement
   ↓
parallel synthesis:
   ├─ Claude token_analysis (3 paragraphs, 180–260 words)
   └─ Claude risk_assessment (structured JSON, heuristic fallback)
   ↓
cache 10min, render
```

The reasoning prompts in `lib/ai/prompts/` are the actual moat — the Block Valley reasoning layer applied to Solana token data. The integration code is open-source (MIT); the prompts are versioned in this repo because we're hackathon-submission stage, but the production version will live in a private package consumed at build time.

## Setup

```bash
npm install
cp .env.example .env.local   # fill in keys you have
npm run dev                  # http://localhost:3000
```

The app degrades gracefully when keys are missing: with no `ANTHROPIC_API_KEY` you'll get on-chain data and a heuristic risk score but no AI synthesis; with no `BIRDEYE_API_KEY` it falls back to DexScreener for price; with no `UPSTASH_REDIS_*` it uses an in-memory cache.

## Required env vars

```
HELIUS_API_KEY=                       # required for usable on-chain reads
NEXT_PUBLIC_SOLANA_RPC=                # client-side RPC for wallet adapter
ANTHROPIC_API_KEY=                    # for AI synthesis + risk scoring
PERPLEXITY_API_KEY=                   # for the catalyst feed
BIRDEYE_API_KEY=                      # for accurate price + multi-timeframe change
TWITTERAPI_IO_KEY=                    # for X sentiment input to synthesis
UPSTASH_REDIS_REST_URL=               # optional, falls back to in-memory
UPSTASH_REDIS_REST_TOKEN=
NEXT_PUBLIC_BV_TREASURY_WALLET=       # SOL receiving address for reclaim fee
NEXT_PUBLIC_JUPITER_REFERRAL_ACCOUNT= # Jupiter referral fee account
```

## Routes

| Route | What it does |
|---|---|
| `/` | Hero — pulse sphere, trending ring, paste box |
| `/token/[ca]` | Full analysis: synthesis, risk, holders, catalysts, tweets, swap |
| `/wallet` | Wallet pulse: portfolio + Hidden SOL reclaim |
| `/search?q=SYMBOL` | Symbol search (filters trending list) |
| `/api/analyze` | POST/GET — full analysis JSON for a CA |
| `/api/trending` | GET — trending Solana tokens for the ring |
| `/api/wallet/[address]` | GET — wallet portfolio scan |
| `/api/reclaim/scan` | GET — find reclaimable empty token accounts |
| `/api/reclaim/build` | POST — build CloseAccount transactions in batches of 27 |
| `/api/swap/quote` | GET — Jupiter quote proxy |
| `/api/swap/build` | POST — Jupiter swap transaction builder |

## Revenue streams (live in v1)

1. **Jupiter swap referral** — 0.20% platform fee on every swap routed through SolBeat.
2. **Reclaim cut** — 5% of the SOL reclaimed from empty token accounts, transparently disclosed before signing.
3. **Analysis API tier** *(roadmap)* — paid endpoint for agents and tools that want to call our synthesis layer.

## License

MIT — frontend + integration code. The reasoning prompts in this repo are the current hackathon snapshot and will move to a private package post-submission.
