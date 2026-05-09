import type { TweetSnippet } from "@/types/token";
import { humanizeNumber } from "@/lib/utils";

export function RecentTweets({ tweets }: { tweets: TweetSnippet[] }) {
  if (tweets.length === 0) {
    return null;
  }
  const top = tweets.slice(0, 5);
  return (
    <div className="glass rounded-2xl p-5 sm:p-6">
      <h3 className="text-[10px] uppercase tracking-[0.2em] text-text-muted mb-4">
        Tweets the synthesis read · {tweets.length} total
      </h3>
      <ul className="space-y-3">
        {top.map((t, i) => (
          <li
            key={i}
            className="rounded-xl border border-subtle px-4 py-3 hover:border-emphasized transition"
          >
            <div className="flex items-center justify-between text-[11px] text-text-muted mb-1.5">
              <a
                href={t.url ?? `https://x.com/${t.handle}`}
                target="_blank"
                rel="noreferrer"
                className="hover:text-text-secondary transition text-mono"
              >
                @{t.handle}
              </a>
              <span>
                {humanizeNumber(t.followers)} followers · {ago(t.age_minutes)}
              </span>
            </div>
            <p className="text-[13px] text-text-primary leading-snug">
              {t.text}
            </p>
            {t.engagement > 0 && (
              <div className="mt-1.5 text-[11px] text-text-muted">
                {humanizeNumber(t.engagement)} engagements
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ago(minutes: number): string {
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 60 * 24) return `${Math.floor(minutes / 60)}h ago`;
  return `${Math.floor(minutes / 60 / 24)}d ago`;
}
