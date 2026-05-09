import type { TokenAnalysis } from "@/types/token";
import { humanizeNumber, humanizePrice, pctChange } from "@/lib/utils";

export function PriceCard({ analysis }: { analysis: TokenAnalysis }) {
  const m = analysis.market;
  const change24 = m.price_change_24h;
  const positive = (change24 ?? 0) >= 0;

  return (
    <div className="glass rounded-2xl p-5 sm:p-6">
      <div className="flex items-baseline gap-3 flex-wrap">
        <div className="text-[40px] sm:text-[48px] leading-none font-semibold text-mono tracking-tight">
          {humanizePrice(m.price_usd)}
        </div>
        {change24 != null && (
          <div
            className={`text-[15px] font-medium text-mono ${
              positive ? "text-signal-positive" : "text-signal-negative"
            }`}
          >
            {pctChange(change24)} <span className="text-text-muted text-[12px]">24h</span>
          </div>
        )}
      </div>

      <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-4 text-[12px]">
        <Stat label="Market cap" value={m.market_cap != null ? `$${humanizeNumber(m.market_cap)}` : "—"} />
        <Stat label="24h volume" value={m.volume_24h != null ? `$${humanizeNumber(m.volume_24h)}` : "—"} />
        <Stat label="Liquidity" value={m.liquidity_usd != null ? `$${humanizeNumber(m.liquidity_usd)}` : "—"} />
        <Stat
          label="Pool age"
          value={m.pair_age_hours != null ? formatAge(m.pair_age_hours) : "—"}
        />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-text-muted text-[11px] uppercase tracking-wider">{label}</div>
      <div className="text-text-primary text-[14px] text-mono mt-1">{value}</div>
    </div>
  );
}

function formatAge(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  if (hours < 24) return `${hours.toFixed(1)}h`;
  if (hours < 24 * 30) return `${Math.round(hours / 24)}d`;
  return `${Math.round(hours / 24 / 30)}mo`;
}
