import type { TokenAnalysis } from "@/types/token";
import { humanizeNumber } from "@/lib/utils";

/**
 * Risk card with the math always visible. Three AIs reviewed an earlier
 * version and all said the same thing: a single 73/100 score is opaque —
 * users want to see which findings are pushing the number up vs. down.
 *
 * So we render one row per factor with:
 *   - the actual finding in plain English ("Mint authority active",
 *     "Top 10 hold 15.2%", "Pool 24mo old")
 *   - the per-factor risk score (0-100) with severity color
 *   - a one-line explanation of why it scored that way
 *
 * Findings are sorted worst-first so the eye lands on the actual problems.
 */
export function RiskScoreCard({ analysis }: { analysis: TokenAnalysis }) {
  const risk = analysis.risk;
  if (!risk) {
    return (
      <div className="glass rounded-2xl p-5 sm:p-6">
        <div className="text-text-secondary text-[13px]">
          Risk scoring unavailable for this token.
        </div>
      </div>
    );
  }

  const labelColor = pickColor(risk.label);
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const dash = (risk.score / 100) * circumference;

  const findings = composeFindings(analysis, risk);

  return (
    <div className="glass rounded-2xl p-5 sm:p-6 h-full flex flex-col">
      <div className="flex items-center gap-5 mb-5">
        <div className="relative shrink-0">
          <svg width="96" height="96" viewBox="0 0 96 96">
            <circle
              cx="48"
              cy="48"
              r={radius}
              fill="none"
              stroke="rgba(10,10,30,0.08)"
              strokeWidth="6"
            />
            <circle
              cx="48"
              cy="48"
              r={radius}
              fill="none"
              stroke={labelColor}
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={`${dash} ${circumference}`}
              transform="rotate(-90 48 48)"
              style={{ filter: `drop-shadow(0 0 8px ${labelColor}55)` }}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-[22px] font-semibold text-mono text-text-primary">
              {risk.score}
            </span>
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <div
            className="text-[10px] uppercase tracking-[0.2em] mb-1.5 font-bold"
            style={{ color: labelColor }}
          >
            Risk · {risk.label}
          </div>
          <p className="text-[13px] text-text-primary leading-snug">
            {risk.top_concern}
          </p>
        </div>
      </div>

      <div className="pt-4 border-t border-border-subtle">
        <div className="text-[9.5px] uppercase tracking-[0.2em] text-text-muted font-bold mb-3">
          The math
        </div>
        <ul className="space-y-2.5">
          {findings.map((f, i) => (
            <FindingRow key={i} finding={f} />
          ))}
        </ul>
      </div>
    </div>
  );
}

type Finding = {
  label: string;
  detail: string;
  /** 0-100, higher = riskier. */
  score: number;
};

function composeFindings(
  a: TokenAnalysis,
  risk: NonNullable<TokenAnalysis["risk"]>,
): Finding[] {
  const out: Finding[] = [];

  // Authorities, name the actual finding (mint OR freeze) rather than a generic bucket
  if (a.metadata.mint_authority) {
    out.push({
      label: "Mint authority active",
      detail: "Supply is not fixed, issuer can mint new tokens.",
      score: 95,
    });
  } else if (a.metadata.freeze_authority) {
    out.push({
      label: "Freeze authority active",
      detail: "Issuer can freeze any holder's balance at any time.",
      score: 80,
    });
  } else {
    out.push({
      label: "Authorities revoked",
      detail: "Mint and freeze are renounced, supply and accounts are fixed.",
      score: 10,
    });
  }

  // Liquidity, show the actual USD figure
  const liq = a.market.liquidity_usd ?? 0;
  out.push({
    label: liq < 5_000
      ? "Liquidity dust-thin"
      : liq < 25_000
        ? "Thin liquidity"
        : liq < 100_000
          ? "Moderate liquidity"
          : "Deep liquidity",
    detail: liq > 0
      ? `$${humanizeNumber(liq)} pooled, small sells move price ${
          liq < 25_000 ? "a lot" : liq < 100_000 ? "noticeably" : "minimally"
        }.`
      : "No liquidity reported by indexer.",
    score: risk.factors.liquidity,
  });

  // Holders, show the actual top-10 percentage
  const top10 = a.holders.top_10_pct;
  const top1 = a.holders.top_1_pct;
  if (top10 != null) {
    out.push({
      label: top10 > 50
        ? "Whale-stacked"
        : top10 > 25
          ? "Concentrated"
          : "Distributed",
      detail: `Top 10 hold ${top10.toFixed(1)}%${
        top1 != null ? ` (top wallet ${top1.toFixed(1)}%)` : ""
      }. ${top10 > 50 ? "One exit could crater the price." : top10 > 25 ? "Watch the top wallets." : "Healthy spread."}`,
      score: risk.factors.holders,
    });
  } else {
    out.push({
      label: "Holders unavailable",
      detail: "Couldn't read top-holder data, RPC didn't return.",
      score: risk.factors.holders,
    });
  }

  // Pool age, show actual age
  const ageH = a.metadata.age_hours ?? a.market.pair_age_hours;
  if (ageH != null) {
    const ageStr = ageH < 24
      ? `${Math.round(ageH)}h`
      : ageH < 24 * 30
        ? `${Math.round(ageH / 24)}d`
        : ageH < 24 * 365
          ? `${Math.round(ageH / 24 / 30)}mo`
          : `${(ageH / 24 / 365).toFixed(1)}yr`;
    out.push({
      label: ageH < 24
        ? "Fresh launch"
        : ageH < 168
          ? "Young pool"
          : ageH < 720
            ? "Maturing"
            : "Established",
      detail: `Pool is ${ageStr} old. ${
        ageH < 24
          ? "No track record yet."
          : ageH < 168
            ? "Still in price-discovery."
            : "Has survived multiple market cycles."
      }`,
      score: risk.factors.age,
    });
  }

  // Volume quality, wash trade signal
  const vol = a.market.volume_24h ?? 0;
  if (liq > 0 && vol > 0) {
    const vlr = vol / liq;
    out.push({
      label: vlr > 20
        ? "Wash-trade pattern"
        : vlr > 10
          ? "Heavy turnover"
          : vlr > 5
            ? "Active trading"
            : "Quiet flow",
      detail: `24h vol $${humanizeNumber(vol)} on $${humanizeNumber(liq)} LP = ${vlr.toFixed(1)}x. ${
        vlr > 20
          ? "That ratio almost never happens organically."
          : vlr > 10
            ? "High but plausible during a hype cycle."
            : "Looks like real trade flow."
      }`,
      score: risk.factors.volume_quality,
    });
  }

  // Sort: worst first.
  return out.sort((a, b) => b.score - a.score);
}

function FindingRow({ finding }: { finding: Finding }) {
  const color = pickFactorColor(finding.score);
  const tone = severityTone(finding.score);
  return (
    <li className="flex items-start gap-3">
      <span
        className="mt-1 inline-flex items-center justify-center shrink-0 size-5 rounded-full text-[10px] font-bold text-mono"
        style={{
          background: `${color}1a`,
          color,
          boxShadow: `inset 0 0 0 1px ${color}55`,
        }}
        aria-hidden
      >
        {Math.round(finding.score)}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-[12.5px] font-semibold text-text-primary">
            {finding.label}
          </span>
          <span
            className="text-[9.5px] uppercase tracking-[0.18em] font-bold"
            style={{ color }}
          >
            {tone}
          </span>
        </div>
        <p className="text-[12px] text-text-secondary leading-relaxed mt-0.5">
          {finding.detail}
        </p>
      </div>
    </li>
  );
}

function severityTone(score: number): string {
  if (score >= 80) return "Severe";
  if (score >= 60) return "High";
  if (score >= 40) return "Moderate";
  if (score >= 20) return "Low";
  return "Clear";
}

function pickFactorColor(score: number): string {
  if (score >= 80) return "#c1374a";
  if (score >= 60) return "#d6601a";
  if (score >= 40) return "#b58a00";
  if (score >= 20) return "#0a8f57";
  return "#0a6f47";
}

function pickColor(label: NonNullable<TokenAnalysis["risk"]>["label"]): string {
  switch (label) {
    case "SAFE": return "#0a8f57";
    case "LOW": return "#0a8f57";
    case "MODERATE": return "#b58a00";
    case "HIGH": return "#d6601a";
    case "EXTREME": return "#c1374a";
    default: return "#4a4a5e";
  }
}
