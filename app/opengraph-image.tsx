import { ImageResponse } from "next/og";

export const runtime = "nodejs";
export const revalidate = 3600;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "SolBeat — the pulse of every Solana token";

/**
 * Homepage OG card. Renders when someone shares the bare solbeat URL on X,
 * Telegram, Discord, etc. Every share is free distribution, so this needs
 * to look like a product, not a landing page. Brand-dark background +
 * gradient mark + headline + the one-line pitch.
 *
 * Pure static — no upstream fetches — so it's served from the CDN cache
 * effectively forever (1h revalidate, but content never actually changes).
 */
export default function HomeOgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background:
            "radial-gradient(ellipse 60% 60% at 80% 10%, rgba(255, 45, 156, 0.35) 0%, rgba(10,10,15,0) 60%), radial-gradient(ellipse 55% 55% at 10% 95%, rgba(94, 92, 255, 0.28) 0%, rgba(10,10,15,0) 60%), #0a0a0f",
          position: "relative",
          padding: "72px 88px",
          fontFamily: "system-ui, -apple-system, sans-serif",
          color: "#f5f5fa",
        }}
      >
        {/* Subtle dot grid texture, kept very low contrast so the
            type and mark stay the focus. */}
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

        {/* Top row: brand mark + wordmark + tagline */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 18,
            position: "relative",
          }}
        >
          <BrandMark size={56} />
          <div
            style={{
              fontSize: 30,
              fontWeight: 800,
              letterSpacing: "-0.02em",
              display: "flex",
              alignItems: "center",
              gap: 16,
            }}
          >
            SolBeat
            <span
              style={{
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: "0.24em",
                textTransform: "uppercase",
                color: "#a0a0b0",
                display: "flex",
              }}
            >
              · by Block Valley Labs
            </span>
          </div>
        </div>

        {/* Spacer */}
        <div style={{ flex: 1, display: "flex" }} />

        {/* Headline */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 18,
            position: "relative",
          }}
        >
          <div
            style={{
              fontSize: 112,
              fontWeight: 800,
              letterSpacing: "-0.045em",
              lineHeight: 0.95,
              display: "flex",
              flexWrap: "wrap",
              gap: 18,
            }}
          >
            <span style={{ display: "flex", color: "#f5f5fa" }}>
              The pulse
            </span>
            <span
              style={{
                display: "flex",
                backgroundImage:
                  "linear-gradient(110deg, #FF2D9C 0%, #5E5CFF 45%, #14F195 100%)",
                backgroundClip: "text",
                color: "transparent",
              }}
            >
              of Solana.
            </span>
          </div>
          <div
            style={{
              fontSize: 28,
              fontWeight: 500,
              color: "#a0a0b0",
              maxWidth: 900,
              lineHeight: 1.3,
              display: "flex",
            }}
          >
            Paste any contract or wallet. Read smart-money signals, risk,
            and live activity. No noise.
          </div>
        </div>

        {/* Bottom row: feature chips */}
        <div
          style={{
            marginTop: 56,
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
            position: "relative",
          }}
        >
          <Chip color="#FF2D9C" label="LIVE WIRE" />
          <Chip color="#5E5CFF" label="WALLET INTEL" />
          <Chip color="#14F195" label="ON-CHAIN" />
          <Chip color="#FFB938" label="AI VERDICT" />
        </div>
      </div>
    ),
    { ...size },
  );
}

/**
 * Inline S-shape mark for the OG card. Approximates the published SolBeat
 * logo without needing to load the 1MB favicon.svg over the network at
 * render time — same gradient palette, same general silhouette so the
 * brand reads correctly when scaled to social-card sizes.
 */
function BrandMark({ size }: { size: number }) {
  const inner = size * 0.92;
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: size / 4,
        background:
          "linear-gradient(135deg, #FF2D9C 0%, #9945FF 50%, #14F195 100%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow:
          "0 0 28px rgba(255, 45, 156, 0.40), inset 0 0 0 1px rgba(255, 255, 255, 0.18)",
      }}
    >
      <svg
        width={inner * 0.62}
        height={inner * 0.62}
        viewBox="0 0 24 24"
        fill="none"
      >
        <path
          d="M3 12h3.5l1.8-4.5 2.4 9 2.4-13 2.4 15 2-6.5h4.5"
          stroke="white"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

function Chip({ color, label }: { color: string; label: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 18px",
        borderRadius: 999,
        background: `${color}1A`,
        border: `1px solid ${color}55`,
        fontSize: 14,
        fontWeight: 800,
        letterSpacing: "0.14em",
        color,
      }}
    >
      <div
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: color,
          boxShadow: `0 0 12px ${color}`,
          display: "flex",
        }}
      />
      {label}
    </div>
  );
}
