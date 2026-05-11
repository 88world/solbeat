# Deployment & secrets

How environment variables work in this project, and what's safe to ship to Vercel.

## TL;DR

- Anything **without** the `NEXT_PUBLIC_` prefix is **server-only**. Vercel encrypts it at rest, injects it into Node.js processes (API routes + server components), and it **never appears in the browser bundle**. Safe.
- Anything **with** `NEXT_PUBLIC_` is **inlined into the JS bundle at build time**. Treat its value as if it were on a billboard.

That's it. Two rules.

## Concretely, in this repo

```bash
# Server-only — encrypted at rest on Vercel, never sent to the browser
HELIUS_API_KEY=...
BIRDEYE_API_KEY=...
ANTHROPIC_API_KEY=...
PERPLEXITY_API_KEY=...
TWITTERAPI_IO_KEY=...
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...

# Public — inlined into the browser bundle, anyone can read these
NEXT_PUBLIC_SOLANA_RPC=https://api.mainnet-beta.solana.com
NEXT_PUBLIC_BV_TREASURY_WALLET=<a public Solana address>
NEXT_PUBLIC_JUPITER_REFERRAL_ACCOUNT=<a public Solana address>
```

The `NEXT_PUBLIC_*` ones above are **public by design**:

- Wallet addresses are inherently public (they're on-chain).
- The Solana RPC URL is needed by the wallet adapter in the browser to connect to the chain.

## The one footgun: don't put a paid RPC key in `NEXT_PUBLIC_SOLANA_RPC`

If you upgrade to a paid RPC (Helius, QuickNode, etc.) and stuff the URL in:

```
NEXT_PUBLIC_SOLANA_RPC=https://mainnet.helius-rpc.com/?api-key=secret123
```

…then `secret123` is now in your browser bundle. Anyone who opens DevTools can lift it and use it from any domain.

**Fix:** in Helius's dashboard, set "Allowed Origins" to your domain (`solbeat.blockvalley.io`). The key still leaks visually, but it can only be used from your origin. Also rotate it periodically.

For the chain-side server calls (`/api/analyze`, `/api/reclaim/*`), use the server-only `HELIUS_API_KEY` — it's used inside the Node.js process and never touches the browser.

## Setting them in Vercel

Two ways:

1. **Dashboard** — Project → Settings → Environment Variables. Pick scope (Production / Preview / Development). Hit save.
2. **CLI** — `vercel env add HELIUS_API_KEY production`. Reads the value from stdin so it's not echoed.

Vercel encrypts all values with KMS, scopes them per-environment, and lets you rotate without redeploys.

## What if I accidentally commit a key?

`.env.local` is gitignored — git won't pick it up unless you force-add. If you do:

1. Rotate the key immediately at the provider.
2. Remove from history: `git rm --cached .env.local && git commit -m "remove env"`. The history still contains it; for true scrubbing use `git filter-repo` or a fresh repo.
3. Set the new key in Vercel.

Never commit `.env.local` itself — only `.env.example` (which has empty values).

## Open-source caveat

The frontend integration code is MIT-licensed. The reasoning prompts (in `lib/ai/prompts/`) are committed for the hackathon submission but will move to a private package post-submission. Per the project's open-core thesis, the integration layer is a free public good; the reasoning IP is not.

When the prompts move private, the public repo will resolve `@blockvalley/reasoning` from a private npm registry at build time. Vercel reads the registry token from `NPM_TOKEN` (server-only env var). Same rules apply.
