import type { TokenAnalysis } from "@/types/token";
import {
  computeSignals,
  composeVerdict,
  type Severity,
  type Signal,
} from "@/lib/pulse/signal";

/**
 * Proprietary signal panel, the "smart synthesis" combining every data
 * source into a single one-line verdict + the underlying signals. The
 * compose logic lives in lib/pulse/signal.ts so the snapshot writer
 * (lib/pulse/snapshots.ts) can produce the same verdict that gets rendered
 * here, the timeline thus shows actual historical SignalPanel verdicts.
 */
export function SignalPanel({ analysis }: { analysis: TokenAnalysis }) {
  const signals = computeSignals(analysis);
  const verdict = composeVerdict(signals, {
    ageHours: analysis.metadata.age_hours,
    liquidity: analysis.market.liquidity_usd,
  });

  // Severity counts so the user can see the verdict's evidence at a glance.
  const counts = signals.reduce(
    (acc, s) => {
      acc[s.severity] = (acc[s.severity] ?? 0) + 1;
      return acc;
    },
    {} as Record<Severity, number>,
  );

  return (
    <div className="glass rounded-2xl p-5 sm:p-6 h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[10px] uppercase tracking-[0.2em] text-text-muted font-bold">
          Signal
        </h3>
        <span className="text-[9.5px] uppercase tracking-[0.18em] text-text-muted">
          on-chain + social
        </span>
      </div>

      <p
        className="text-[14px] sm:text-[15px] font-semibold leading-snug mb-4"
        style={{ color: verdict.color }}
      >
        {verdict.text}
      </p>

      <div className="flex flex-wrap gap-1.5">
        {signals.map((s, i) => (
          <SignalPill key={i} signal={s} />
        ))}
      </div>

      {/* Tally row at the bottom. Visually balances the card against the
          longer Risk findings list to its right. */}
      <div className="mt-auto pt-4 border-t border-border-subtle grid grid-cols-4 gap-2">
        <Tally label="Good" count={counts.good ?? 0} color="#0a8f57" />
        <Tally label="Watch" count={counts.warn ?? 0} color="#d6601a" />
        <Tally label="Bad" count={counts.bad ?? 0} color="#c1374a" />
        <Tally label="Neutral" count={counts.neutral ?? 0} color="#5a5a70" />
      </div>
    </div>
  );
}

function Tally({
  label,
  count,
  color,
}: {
  label: string;
  count: number;
  color: string;
}) {
  return (
    <div className="text-center">
      <div
        className="text-[20px] font-semibold text-mono leading-none"
        style={{ color: count > 0 ? color : "#9a9aae" }}
      >
        {count}
      </div>
      <div
        className="text-[9px] uppercase tracking-[0.18em] font-bold mt-1.5"
        style={{ color: count > 0 ? color : "#9a9aae" }}
      >
        {label}
      </div>
    </div>
  );
}


function SignalPill({ signal }: { signal: Signal }) {
  const styles: Record<Severity, { bg: string; color: string; ring: string }> = {
    good:    { bg: "rgba(20, 241, 149, 0.10)", color: "#0a6f47", ring: "rgba(20, 241, 149, 0.35)" },
    neutral: { bg: "rgba(10, 10, 30, 0.05)",   color: "#4a4a5e", ring: "rgba(10, 10, 30, 0.10)" },
    warn:    { bg: "rgba(214, 96, 26, 0.10)",  color: "#d6601a", ring: "rgba(214, 96, 26, 0.30)" },
    bad:     { bg: "rgba(193, 55, 74, 0.10)",  color: "#c1374a", ring: "rgba(193, 55, 74, 0.30)" },
  };
  const s = styles[signal.severity];
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10.5px] font-semibold"
      style={{
        background: s.bg,
        color: s.color,
        boxShadow: `inset 0 0 0 1px ${s.ring}`,
      }}
    >
      <span className="font-bold uppercase tracking-[0.10em] text-[9.5px]">
        {signal.label}
      </span>
      <span className="text-mono opacity-75">{signal.value}</span>
    </span>
  );
}

