import { ImageResponse } from "next/og";
import { isValidSolanaAddress } from "@/lib/solana/validation";
import { fetchWalletIdentity } from "@/lib/data/wallet";
import { shortAddress } from "@/lib/utils";

export const runtime = "nodejs";
export const revalidate = 60;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "SolBeat — wallet profile";

/**
 * Per-wallet OG card. When someone shares /wallet/[address], the social
 * preview surfaces the most degen-relevant facts at a glance:
 *
 *   - Whale Score dial (huge, brand-pink if high)
 *   - Truncated address + alias (Smart · theo, Whale, Veteran, etc.)
 *   - SOL balance + wallet age
 *
 * Pure on-chain data, single Helius call (getAccountKind + 1 signature
 * page) via fetchWalletIdentity. Cached 60s by Vercel's image runtime.
 */
export default async function WalletOgImage({
  params,
}: {
  params: Promise<{ address: string }>;
}) {
  const { address } = await params;
  if (!isValidSolanaAddress(address)) {
    return fallback("Invalid address", address);
  }

  const profile = await fetchWalletIdentity(address).catch(() => null);
  if (!profile || profile.not_a_wallet === "token-mint") {
    return fallback("Not a wallet", address);
  }

  const id = profile.identity;
  const top = id.badges[0]?.label ?? null;
  const tier =
    id.whale_score >= 85
      ? { label: "MEGA WHALE", color: "#d6601a" }
      : id.whale_score >= 60
        ? { label: "WHALE", color: "#c1374a" }
        : id.whale_score >= 30
          ? { label: "ACTIVE", color: "#0a8f57" }
          : { label: "SHRIMP", color: "#5a5a70" };

  return new ImageResponse(
    (
      <Card
        address={address}
        alias={id.alias}
        topBadge={top}
        sol={id.sol_balance}
        ageDays={id.age_days}
        score={id.whale_score}
        tierLabel={tier.label}
        tierColor={tier.color}
      />
    ),
    { ...size },
  );
}

function fallback(message: string, address: string) {
  return new ImageResponse(
    (
      <Card
        address={address}
        alias={null}
        topBadge={null}
        sol={0}
        ageDays={null}
        score={0}
        tierLabel={message.toUpperCase()}
        tierColor="#5a5a70"
      />
    ),
    { ...size },
  );
}

function Card({
  address,
  alias,
  topBadge,
  sol,
  ageDays,
  score,
  tierLabel,
  tierColor,
}: {
  address: string;
  alias: string | null;
  topBadge: string | null;
  sol: number;
  ageDays: number | null;
  score: number;
  tierLabel: string;
  tierColor: string;
}) {
  // Half-arc dial geometry. Same math as the in-app WhaleScoreDial.
  const radius = 130;
  const arcLength = Math.PI * radius;
  const dashOffset = arcLength * (1 - score / 100);

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "row",
        background:
          "radial-gradient(ellipse 60% 60% at 85% 15%, rgba(255, 45, 156, 0.30) 0%, rgba(10,10,15,0) 60%), radial-gradient(ellipse 55% 55% at 12% 90%, rgba(94, 92, 255, 0.28) 0%, rgba(10,10,15,0) 60%), #0a0a0f",
        padding: "64px 80px",
        fontFamily: "system-ui, -apple-system, sans-serif",
        color: "#f5f5fa",
        position: "relative",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.04) 1px, transparent 0)",
          backgroundSize: "32px 32px",
          display: "flex",
        }}
      />

      {/* LEFT side: identity */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          gap: 18,
          position: "relative",
          paddingRight: 40,
        }}
      >
        {/* SolBeat header */}
        <div
          style={{ display: "flex", alignItems: "center", gap: 14 }}
        >
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 9,
              background:
                "linear-gradient(135deg, #FF2D9C 0%, #9945FF 60%, #14F195 100%)",
              boxShadow: "0 0 16px rgba(255, 45, 156, 0.45)",
              display: "flex",
            }}
          />
          <div
            style={{
              fontSize: 22,
              fontWeight: 800,
              letterSpacing: "-0.02em",
              display: "flex",
            }}
          >
            SolBeat
          </div>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              color: "#a0a0b0",
              display: "flex",
            }}
          >
            · WALLET PROFILE
          </div>
        </div>

        {/* Alias / badge */}
        {(alias || topBadge) && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 18px",
              borderRadius: 999,
              background: "rgba(255, 45, 156, 0.14)",
              border: "1px solid rgba(255, 45, 156, 0.40)",
              alignSelf: "flex-start",
              fontSize: 18,
              fontWeight: 800,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "#FF2D9C",
              marginTop: 4,
            }}
          >
            <div
              style={{
                width: 9,
                height: 9,
                borderRadius: "50%",
                background: "#FF2D9C",
                boxShadow: "0 0 10px #FF2D9C",
                display: "flex",
              }}
            />
            {alias ? `Smart · ${alias}` : topBadge}
          </div>
        )}

        {/* Truncated address */}
        <div
          style={{
            fontSize: 76,
            fontWeight: 800,
            letterSpacing: "-0.04em",
            lineHeight: 1,
            display: "flex",
            fontFamily: "ui-monospace, monospace",
          }}
        >
          {shortAddress(address, 6, 6)}
        </div>

        {/* Spacer */}
        <div style={{ flex: 1, display: "flex" }} />

        {/* Stats */}
        <div style={{ display: "flex", gap: 36 }}>
          <Stat
            label="SOL"
            value={`${sol.toFixed(sol < 1 ? 4 : 2)} ◎`}
          />
          <Stat
            label="Age"
            value={
              ageDays == null
                ? "—"
                : ageDays >= 365
                  ? `${(ageDays / 365).toFixed(1)}y`
                  : ageDays >= 30
                    ? `${Math.round(ageDays / 30)}mo`
                    : `${ageDays}d`
            }
          />
        </div>
      </div>

      {/* RIGHT side: whale score dial */}
      <div
        style={{
          width: 360,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 14,
          position: "relative",
        }}
      >
        <svg width="320" height="220" viewBox="0 0 320 220">
          <path
            d={`M ${160 - radius} 180 A ${radius} ${radius} 0 0 1 ${160 + radius} 180`}
            fill="none"
            stroke="rgba(255,255,255,0.12)"
            strokeWidth={16}
            strokeLinecap="round"
          />
          <path
            d={`M ${160 - radius} 180 A ${radius} ${radius} 0 0 1 ${160 + radius} 180`}
            fill="none"
            stroke={tierColor}
            strokeWidth={16}
            strokeLinecap="round"
            strokeDasharray={`${arcLength}`}
            strokeDashoffset={dashOffset}
            style={{ filter: `drop-shadow(0 0 12px ${tierColor}99)` }}
          />
        </svg>
        <div
          style={{
            position: "absolute",
            top: 92,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          <div
            style={{
              fontSize: 88,
              fontWeight: 900,
              lineHeight: 1,
              color: tierColor,
              fontFamily: "ui-monospace, monospace",
              letterSpacing: "-0.04em",
              display: "flex",
            }}
          >
            {Math.round(score)}
          </div>
          <div
            style={{
              fontSize: 14,
              fontWeight: 800,
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              color: tierColor,
              marginTop: 6,
              display: "flex",
            }}
          >
            {tierLabel}
          </div>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.20em",
              textTransform: "uppercase",
              color: "#a0a0b0",
              marginTop: 4,
              display: "flex",
            }}
          >
            WHALE SCORE
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div
        style={{
          fontSize: 13,
          fontWeight: 800,
          letterSpacing: "0.22em",
          textTransform: "uppercase",
          color: "#a0a0b0",
          display: "flex",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 38,
          fontWeight: 800,
          letterSpacing: "-0.02em",
          fontFamily: "ui-monospace, monospace",
          display: "flex",
        }}
      >
        {value}
      </div>
    </div>
  );
}
