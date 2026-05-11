# SolBeat — Pitch Document

> The pulse of every Solana token, in plain English.

**Live demo:** [solbeat.blockvalley.io](https://solbeat.blockvalley.io)
**Repo:** [github.com/88world/solbeat](https://github.com/88world/solbeat)
**Built for:** Solana Frontier Hackathon (Colosseum), May 11, 2026
**Team:** Kenji at [Block Valley Labs](https://blockvalley.io)

---

## The one-line pitch

DEXScreener shows you 47 numbers. SolBeat tells you what they mean.

## The 30-second pitch

SolBeat reads any Solana token the way a senior trader would explain it to a friend. Paste a contract address, get a three-paragraph synthesis covering origin, what is happening, and what to watch. The synthesis fuses on-chain data, X sentiment, and live news into one read, so a degen can decide in seconds instead of context-switching across five tools.

The AI synthesis is the differentiator. Everything else is plumbing.

---

## The problem

Solana degens spend ten minutes per token across DEXScreener, Photon, Birdeye, Twitter search, Telegram channels, Solscan, and a manual mental risk calculation. Most of it is sub-second instinctual filtering: "is the mint authority active," "are top holders concentrated," "is anyone talking about this," "is the catalyst real or a copy of a copy."

That work is mechanical. It does not need to be done by a human ten minutes at a time. It needs to be done in three seconds and read like prose.

## The solution

Paste a Solana contract address into SolBeat. In under five seconds you get:

- **Three plain-English paragraphs** about what the token is, what is happening right now, and what to watch out for. Written in the voice of a senior trader.
- **A 0-100 risk score** with a factor breakdown across liquidity, holder concentration, mint/freeze authorities, age, and volume quality.
- **Live buy/sell pressure** with a trailing buy% trend sparkline.
- **Live catalysts** for the last 24 hours, with source citations.
- **Recent X posts** ranked KOL-first, blue-checks before raw engagement.
- **Holder map** with smart-money labels for 17 curated KOL wallets (theo, Nyhrox, Cented, Jijo, and 13 others).
- **A pump.fun bonding-curve gauge** if the token is pre-graduation.

For wallets, paste any base58 address and see badges, a USD-weighted aggregate risk dial, smart-money overlap chips ("you hold what theo holds"), holdings donut, and a 90-day activity heatmap. Connect your own wallet to track up to two others — their next on-chain move surfaces in Live Wire within ten minutes.

---

## Why SolBeat wins

### "DEXScreener shows you 47 numbers. SolBeat tells you what they mean."

The differentiator is the AI synthesis. Every Solana data tool is a different lens on the same DEXScreener API. SolBeat is the only one that interprets the data for you in three paragraphs.

### First Solana analytics tool fusing on-chain + X sentiment + live news in one AI synthesis

The synthesis prompt sees:
- On-chain metadata (Helius DAS)
- Price + liquidity + volume across 5m/1h/6h/24h (DexScreener)
- Top-20 holders with KOL classification (Helius RPC)
- 12 recent X posts ranked by reach (twitterapi.io)
- 4 catalysts from the last 24h with citations (Perplexity Sonar)

No competing tool combines all five in one pass.

### Built for the speed Solana enables

- Sub-second on-chain reads (Helius)
- Cheap reclaims of locked SOL (~$0.002 rent per dead token account, 5% platform fee)
- Instant swaps via Jupiter v6, no app-switching

### Open-core architecture

Integration code is MIT (everything in the repo). The reasoning layer (proprietary prompts that drive Claude) is environment-variable-loaded, not in source. Anyone can fork and run, but the brand voice and JSON-shape engineering stays in-house.

---

## What's actually shipped (the receipts)

### Routes live in production

| Route | What it does |
|---|---|
| `/` | Hero with live BPM ECG, trending list, live activity feed, ecosystem strip, tokens-to-watch grid |
| `/token/[ca]` | Full token analysis: AI synthesis, candlestick chart, buy/sell pressure, risk score, holder list, bubble map, signal panel, catalysts, tweets, pulse timeline, swap panel |
| `/wallet` | Connected-wallet view: aggregate risk dial, top flagged positions, smart-money overlap, hidden SOL reclaim, tracked-wallets management |
| `/wallet/[address]` | Public wallet profile: badges + whale score, portfolio donut, 90-day activity heatmap, holdings, recent signatures |
| `/trending` | Full trending leaderboard |
| `/search` | Symbol search |

### Seven event kinds in the Live Wire banner

🎓 Graduation · 🚀 Rip · 🩸 Dump · 🏁 Mcap milestone · 🎯 Sniper · 🧠 Smart-money move · ★ Tracked-wallet move

Each links to a relevant target (token page or wallet profile). The `★ Tracked` kind is user-driven: connect a wallet, track up to two others (free tier) with custom labels, and any signature they sign in the last 10 minutes surfaces here in real time.

### Five Suspense-streamed cells per token page

Initial server render → AI synthesis cell streams in last (~3-5s), behind a branded loading skeleton.

### 17 curated KOL wallets

theo, Nyhrox, Letterbomb, Cented, Jijo, Cupsey, chester, Publix, Walta, Brox, zeropnl, Smokez, Heyitsyolo, Hesi, Kadenox, plus two unnamed top traders.

### Sample synthesis output (real, generated by Anthropic Claude against BONK)

> **What this is:** "Bonk is a memecoin on Solana with 88 trillion tokens in circulation and a 2-year history. Mint authority is still active, meaning the deployer can create new supply at will, which is the defining risk..."

> **What's happening:** "Price is up 4% over 24 hours on 4.2M in volume, but the last 6 hours show a 0.96% decline despite sustained transaction flow. Buy-to-sell ratio flipped negative in the past hour (144 buys vs 213 sells)..."

> **What to know:** "The active mint authority is a live grenade. Liquidity is thin at 596K against a 666M market cap, meaning any real exit pressure will slippage hard. Holder concentration data is missing, which is a red flag..."

This is what every paste returns. Trader voice. Real numbers. No emoji. No hype.

---

## Architecture

```
User pastes CA
      │
      ▼
Validation (base58, 32-byte decode)
      │
      ▼
┌── Parallel fetch ──────────────────────────────────┐
│ Helius RPC          on-chain metadata + mint state │
│ DexScreener         price, liquidity, 5m/1h/24h    │
│ Birdeye             market data enrichment         │
│ twitterapi.io       recent X posts + engagement    │
│ Perplexity Sonar    live news + sourced catalysts  │
└────────────────────────────────────────────────────┘
      │
      ▼
Anthropic Claude synthesis (3-paragraph read + risk score)
      │
      ▼
Upstash Redis cache (tiered TTLs: 30min tweets, 1h catalysts,
                     2h synthesis, 6h risk, 24h metadata)
      │
      ▼
Initial render: streamed via React Server Components + Suspense
(fast path lands above-the-fold first, slow path streams in behind)
      │
      ▼
Hydration: client cells (PriceCard, BuySellPressure, BondingCurve)
poll /api/token/[ca]/quick + /pump for live updates
```

### Graceful degradation contract

Missing API keys disable their feature, they never crash the build:
- Helius missing → falls back to public RPC
- Birdeye missing → DexScreener carries the load
- Perplexity missing → Catalysts panel renders empty
- Anthropic missing → Risk scoring uses pure-TypeScript heuristic baseline
- Upstash missing → falls back to per-process in-memory cache

The site loads and the core flow works with only Helius configured.

---

## Tech stack

| Layer | Tools |
|---|---|
| **App** | Next.js 16 (App Router + Turbopack), TypeScript 5, Tailwind v4, shadcn/ui |
| **Animation** | Three.js, anime.js, framer-motion, D3 |
| **Solana** | wallet-adapter, Helius RPC, Birdeye, DexScreener, Jupiter v6 |
| **AI** | Anthropic Claude, Perplexity Sonar Pro |
| **Social** | twitterapi.io |
| **Caching** | Upstash Redis with in-memory fallback |
| **Deploy** | Vercel (auto-deploy on push to main) |

### Pulse / animation choreography (the "BV brand")

- **WebGL particle field** (Three.js) for the buy/sell flow visualization — 400 particles per lane, additive blending, lazy-mounted on mobile behind a tap-to-expand disclosure
- **Canvas2D ECG trace + heart waveform** for the live BPM bar, four sine carriers stacked at SOL/breadth/volume/extreme weights
- **anime.js stagger entries** for trending list rotation + entrance choreography
- **D3 force-layout** for holder bubble map
- **lightweight-charts (TradingView)** for the candlestick chart, code-split out of initial JS bundle

---

## The numbers

### Performance

- **2.6s** Next.js production build
- **< 200ms** Upstash cache hits on token analysis (vs 10-15s cold)
- **~70x speedup** on repeat-visit token analyses after caching layer
- **180ms** average response time on `/api/trending`

### Cost reduction story

| Metric | Before | After | Reduction |
|---|---|---|---|
| Per cold token analysis | ~$0.046 (uncached, previous model) | ~$0.010 (current model + Upstash) | **78%** |
| Per repeat visit | ~$0.046 | $0 (Redis hit) | **100%** |
| Estimated 43-day judging cost | $50-$200 | $1-$5 | **97%** |

Five model + caching changes drove this:
1. Switched to a more cost-efficient Anthropic Claude tier (~4x cheaper rate)
2. Added Upstash Redis caching with tiered TTLs (2h synthesis, 6h risk, 24h metadata, 1h catalysts, 30min tweets)
3. Trimmed AI payload: 25 tweets → 12, 6 catalysts → 4
4. Lazy-loaded the Social Signal panel (defer client display until opt-in)
5. Bumped cache key version prefix to invalidate broken nulls without destructive flush

### Engineering rigor

- **90+ commits** across the development arc
- **Zero TypeScript errors**, zero ESLint errors at production build
- **IntersectionObserver-gated canvas rAF** on every animation surface (LiveChart, HeartWave, ECGTrace, LiveFlow) so off-screen visuals stop rendering
- **`document.hidden` gate** on all seven polling intervals (Hero, LiveActivityFeed, EcosystemStrip, TokensToWatch, PriceCard, BondingCurveCard, BuySellPressure) so background tabs stop fetching
- **DPR clamped to 1.5** on canvas surfaces (was 2) — halves rendered pixels on Retina with imperceptible quality loss
- **Hover-aware poll cadence** on the two fastest pollers (BuySellPressure 8s → 15s idle, BondingCurveCard 12s → 20s idle) — active inspection still gets fresh data

### Code organization

- **30+ React components** across hero, token, wallet, wallet-profile, shared, home cells
- **18 server API routes** including a wallet-intel composite that runs three parallel upstream calls
- **5 data integrators** (Helius, DexScreener, Birdeye, Jupiter, pump.fun direct RPC parsing) plus Perplexity + twitterapi.io
- **Two-phase Suspense streaming** on the token page (analyzeFast lands instantly, analyzeSlow streams synthesis in behind)

---

## What's next

- **Compare Pulses.** Side-by-side analysis of two or more tokens with a synthesized "which would you rather hold" verdict.
- **Wallet copy-trade lookup.** Paste a wallet, get an AI summary of its trading thesis derived from public transaction history.
- **Skills marketplace.** Expose SolBeat's analysis as an agent-callable skill so other apps can plug into the reasoning layer.
- **Mobile native app.** iOS first.
- **Real-time pulse notifications.** Watchlist a token, get pinged when its pulse meaningfully changes (BPM jumps, risk score shifts, smart money moves).

---

## Team

**Kenji** — solo build. [Block Valley Labs](https://blockvalley.io).

Reach: [admin@blockvalley.io](mailto:admin@blockvalley.io)

---

## Quick demo script (90 seconds)

**0:00** — Open `solbeat.blockvalley.io`. Point at the hero. "Three live data layers: the BPM is computing market heat from 30 trending tokens, the Live Wire banner is streaming pump.fun graduations and KOL wallet moves, the trending list rotates the freshest tokens every 4.5 seconds."

**0:20** — Paste a real CA into the search box. Token page loads, AI synthesis cell shows a branded loading skeleton. "Behind the scenes: parallel fetches across Helius, DexScreener, twitterapi.io, Perplexity, and on-chain pump.fun curve state. All cached in Upstash so repeat visits are instant."

**0:35** — AI synthesis lands. Read the three paragraphs out loud. Point at the risk dial. "That's the differentiator. A senior trader's read, not a data dump."

**0:55** — Scroll to the holder map. Point at the smart-money pink chip. "Theo holds this. He's #1 on the kolscan leaderboard. We label 17 of those across every token analysis."

**1:10** — Click into a smart-money chip on the Live Wire banner. Lands on `/wallet/<theo-address>`. "Public wallet profile. Whale Score 87. Activity heatmap. Portfolio donut. Smart-money overlap shows tokens this wallet shares with yours."

**1:30** — End. "DEXScreener shows you 47 numbers. SolBeat tells you what they mean."

---

## Slide deck outline (suggested NotebookLM extraction)

1. **Title** — "SolBeat: the pulse of every Solana token, in plain English"
2. **Problem** — Ten minutes per token across five tools. The mechanical work needs to be three seconds.
3. **Solution** — Paste CA → 3-paragraph senior-trader read in 5 seconds. AI synthesis is the product.
4. **Live demo** — screenshot of the token page with the synthesis visible
5. **Differentiation** — DEXScreener vs SolBeat side-by-side (numbers vs interpretation)
6. **Architecture** — the data-flow diagram (parallel fetch → Claude → Suspense stream)
7. **Tech stack** — single slide with logos: Next.js, Claude, Perplexity, Helius, Solana
8. **The numbers** — 82 commits, 97% cost reduction, ~70x cache speedup, sub-200ms hits
9. **Open-core** — integration MIT, reasoning layer proprietary
10. **What's next** — Compare Pulses, wallet copy-trade lookup, skills marketplace, mobile, alerts
11. **Team + close** — Kenji at Block Valley Labs, solbeat.blockvalley.io, built for Solana Frontier
