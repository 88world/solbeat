import { ImageResponse } from "next/og";
import { fetchBestSolanaPair } from "@/lib/data/dexscreener";
import { getMintAccount } from "@/lib/data/helius";
import { isValidSolanaAddress } from "@/lib/solana/validation";

export const runtime = "nodejs";
export const revalidate = 60;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * OG card for a single token. Renders a 1200×630 PNG that gets picked up
 * automatically by social embeds (X, Telegram, Discord) when someone shares
 * the URL. The whole point: every share is free distribution.
 *
 * Data is intentionally slim, only DexScreener (price + symbol) and a single
 * Helius RPC for mint authority. We skip the AI + Perplexity + Twitter calls
 * that the full page makes; OG renders need to be cheap and fast (<1s) so
 * scrapers don't time out, and most of that data isn't useful in 1200×630
 * anyway.
 */
export default async function TokenOgImage({
  params,
}: {
  params: Promise<{ ca: string }>;
}) {
  const { ca } = await params;
  if (!isValidSolanaAddress(ca)) {
    return fallbackCard("Invalid address", ca, "-", "-", "-", "warm");
  }

  // Both calls in parallel, they're independent.
  const [pair, mintInfo] = await Promise.all([
    fetchBestSolanaPair(ca).catch(() => null),
    getMintAccount(ca).catch(() => null),
  ]);

  const symbol = pair?.baseToken?.symbol ?? "-";
  const name = pair?.baseToken?.name ?? "Unknown token";
  const priceUsd = pair?.priceUsd ? Number(pair.priceUsd) : null;
  const change24h = pair?.priceChange?.h24 ?? null;
  const liquidity = pair?.liquidity?.usd ?? 0;

  const verdict = composeVerdict({
    mintAuthority: mintInfo?.mintAuthority ?? null,
    freezeAuthority: mintInfo?.freezeAuthority ?? null,
    liquidity,
    change24h: change24h ?? 0,
  });

  return new ImageResponse(
    (
      <Card
        symbol={symbol}
        name={name}
        priceUsd={priceUsd}
        change24h={change24h}
        verdict={verdict.text}
        tone={verdict.tone}
      />
    ),
    { ...size },
  );
}

type Tone = "good" | "warn" | "bad" | "neutral" | "warm";

function Card({
  symbol,
  name,
  priceUsd,
  change24h,
  verdict,
  tone,
}: {
  symbol: string;
  name: string;
  priceUsd: number | null;
  change24h: number | null;
  verdict: string;
  tone: Tone;
}) {
  const accentColor = pickAccent(tone);
  const changeColor =
    change24h == null
      ? "#5a5a70"
      : change24h >= 0
        ? "#0a8f57"
        : "#c1374a";

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background:
          "linear-gradient(135deg, #FCFCFE 0%, #F5F2FF 55%, #FFEDF7 100%)",
        position: "relative",
        padding: "72px 80px",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      {/* Decorative orb in the corner, echoes the brand sphere */}
      <div
        style={{
          position: "absolute",
          top: -120,
          right: -120,
          width: 460,
          height: 460,
          borderRadius: "50%",
          background:
            tone === "bad" || tone === "warn"
              ? "radial-gradient(circle, rgba(255, 45, 156, 0.40) 0%, rgba(255, 139, 45, 0.18) 50%, rgba(255, 45, 156, 0) 75%)"
              : "radial-gradient(circle, rgba(94, 92, 255, 0.40) 0%, rgba(20, 241, 149, 0.18) 50%, rgba(94, 92, 255, 0) 75%)",
          filter: "blur(8px)",
          display: "flex",
        }}
      />

      {/* Top row: SolBeat wordmark + tag */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          marginBottom: 56,
        }}
      >
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: "50%",
            background:
              "linear-gradient(135deg, #FF2D9C 0%, #5E5CFF 60%, #14F195 100%)",
            display: "flex",
          }}
        />
        <div
          style={{
            fontSize: 22,
            fontWeight: 700,
            letterSpacing: "-0.02em",
            color: "#0a0a1e",
            display: "flex",
          }}
        >
          SolBeat
        </div>
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.20em",
            textTransform: "uppercase",
            color: "#5a5a70",
            marginLeft: 4,
            display: "flex",
          }}
        >
          · the pulse of every Solana token
        </div>
      </div>

      {/* Token symbol + name */}
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div
          style={{
            fontSize: 96,
            fontWeight: 800,
            letterSpacing: "-0.04em",
            color: "#0a0a1e",
            lineHeight: 0.95,
            display: "flex",
          }}
        >
          ${symbol}
        </div>
        <div
          style={{
            fontSize: 28,
            fontWeight: 500,
            color: "#3a3a4e",
            display: "flex",
          }}
        >
          {name}
        </div>
      </div>

      {/* Spacer */}
      <div style={{ flex: 1, display: "flex" }} />

      {/* Price row */}
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 32,
          marginBottom: 24,
        }}
      >
        <div
          style={{
            fontSize: 72,
            fontWeight: 700,
            letterSpacing: "-0.03em",
            color: "#0a0a1e",
            display: "flex",
          }}
        >
          {priceUsd != null ? formatPrice(priceUsd) : "-"}
        </div>
        {change24h != null && (
          <div
            style={{
              fontSize: 32,
              fontWeight: 700,
              color: changeColor,
              display: "flex",
            }}
          >
            {change24h >= 0 ? "+" : ""}
            {change24h.toFixed(1)}% 24h
          </div>
        )}
      </div>

      {/* Verdict bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          padding: "20px 28px",
          background: "rgba(255, 255, 255, 0.7)",
          backdropFilter: "blur(20px)",
          border: `1px solid ${accentColor}33`,
          boxShadow: `inset 4px 0 0 ${accentColor}`,
          borderRadius: 14,
          maxWidth: 980,
        }}
      >
        <div
          style={{
            fontSize: 12,
            fontWeight: 800,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            color: accentColor,
            display: "flex",
          }}
        >
          Signal
        </div>
        <div
          style={{
            fontSize: 26,
            fontWeight: 600,
            color: "#0a0a1e",
            letterSpacing: "-0.01em",
            display: "flex",
            flex: 1,
          }}
        >
          {verdict}
        </div>
      </div>
    </div>
  );
}

function fallbackCard(
  title: string,
  ca: string,
  symbol: string,
  name: string,
  price: string,
  tone: Tone,
) {
  return new ImageResponse(
    (
      <Card
        symbol={symbol}
        name={name}
        priceUsd={null}
        change24h={null}
        verdict={title}
        tone={tone}
      />
    ),
    { ...size },
  );
}

function pickAccent(tone: Tone): string {
  switch (tone) {
    case "good": return "#0a8f57";
    case "warn": return "#d6601a";
    case "bad": return "#c1374a";
    case "warm": return "#FF2D9C";
    case "neutral":
    default: return "#5E5CFF";
  }
}

function composeVerdict({
  mintAuthority,
  freezeAuthority,
  liquidity,
  change24h,
}: {
  mintAuthority: string | null;
  freezeAuthority: string | null;
  liquidity: number;
  change24h: number;
}): { text: string; tone: Tone } {
  if (mintAuthority) {
    return {
      text: "Mint authority still live. Supply is not fixed.",
      tone: "bad",
    };
  }
  if (freezeAuthority) {
    return {
      text: "Freeze authority active. Balances can be frozen.",
      tone: "warn",
    };
  }
  if (liquidity > 0 && liquidity < 25_000) {
    return {
      text: "Thin liquidity. Small sells move the price meaningfully.",
      tone: "warn",
    };
  }
  if (change24h >= 50) {
    return {
      text: `Pumping +${change24h.toFixed(0)}%. Momentum is real, watch the holders.`,
      tone: "good",
    };
  }
  if (change24h <= -30) {
    return {
      text: `Bleeding ${change24h.toFixed(0)}%. Sit on your hands.`,
      tone: "bad",
    };
  }
  if (change24h >= 10) {
    return {
      text: `Drifting up +${change24h.toFixed(0)}%. Clean fundamentals so far.`,
      tone: "good",
    };
  }
  return {
    text: "Authorities revoked, healthy liquidity. Watching the action.",
    tone: "neutral",
  };
}

function formatPrice(p: number): string {
  if (p >= 1) return `$${p.toLocaleString("en-US", { maximumFractionDigits: 4 })}`;
  if (p >= 0.01) return `$${p.toFixed(4)}`;
  if (p >= 0.0001) return `$${p.toFixed(6)}`;
  // Tiny prices, show subscript-style
  return `$${p.toExponential(2)}`;
}
