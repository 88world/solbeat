import type { CatalystItem } from "@/types/token";

export function CatalystFeed({ catalysts }: { catalysts: CatalystItem[] }) {
  if (catalysts.length === 0) {
    return (
      <div className="glass rounded-2xl p-5">
        <h3 className="text-[10px] uppercase tracking-[0.2em] text-text-muted mb-2 font-bold">
          Catalysts
        </h3>
        <p className="text-[13px] text-text-secondary">
          Nothing newsworthy in the last 24 hours.
        </p>
      </div>
    );
  }

  return (
    <div className="glass rounded-2xl p-5 sm:p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[10px] uppercase tracking-[0.2em] text-text-muted font-bold">
          Catalysts
        </h3>
        <span className="text-[9.5px] uppercase tracking-[0.18em] text-text-muted">
          last 24h
        </span>
      </div>
      <ul className="space-y-3.5">
        {catalysts.map((c, i) => (
          <li
            key={i}
            className="relative pl-3.5 border-l-2"
            style={{ borderColor: pickAccent(i) }}
          >
            {c.title && (
              <h4 className="text-[13px] font-bold text-text-primary leading-snug mb-0.5">
                {c.title}
              </h4>
            )}
            <p className="text-[12.5px] text-text-secondary leading-relaxed">
              {c.summary}
            </p>
            {c.url && (
              <a
                href={c.url}
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-flex items-center gap-1 text-[10.5px] text-text-muted hover:text-text-secondary transition"
              >
                <span className="text-mono">{c.source}</span>
                <span aria-hidden className="text-[8px]">↗</span>
              </a>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

const ACCENTS = ["#FF2D9C", "#5E5CFF", "#14F195", "#FF8B2D", "#8A6BFF"];

function pickAccent(i: number): string {
  return ACCENTS[i % ACCENTS.length];
}
