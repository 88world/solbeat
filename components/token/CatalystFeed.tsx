import type { CatalystItem } from "@/types/token";

export function CatalystFeed({ catalysts }: { catalysts: CatalystItem[] }) {
  if (catalysts.length === 0) {
    return (
      <div className="glass rounded-2xl p-5">
        <h3 className="text-[10px] uppercase tracking-[0.2em] text-text-muted mb-2">
          Catalysts
        </h3>
        <p className="text-[13px] text-text-secondary">
          No recent catalysts surfaced. The Perplexity-driven feed is empty
          either because nothing newsworthy hit the wire in the last 24h, or
          the Perplexity API key is unconfigured.
        </p>
      </div>
    );
  }

  return (
    <div className="glass rounded-2xl p-5 sm:p-6">
      <h3 className="text-[10px] uppercase tracking-[0.2em] text-text-muted mb-4">
        Catalysts · sourced live
      </h3>
      <ul className="space-y-3">
        {catalysts.map((c, i) => (
          <li key={i} className="border-b border-subtle pb-3 last:border-0 last:pb-0">
            <p className="text-[14px] text-text-primary leading-snug">
              {c.summary}
            </p>
            <div className="mt-1.5 flex items-center gap-2 text-[11px] text-text-muted">
              <span>{c.source}</span>
              {c.url && (
                <>
                  <span>·</span>
                  <a
                    href={c.url}
                    target="_blank"
                    rel="noreferrer"
                    className="hover:text-text-secondary transition"
                  >
                    Source →
                  </a>
                </>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
