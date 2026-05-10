import type { TweetSnippet } from "@/types/token";
import { humanizeNumber } from "@/lib/utils";

/**
 * Tweet feed styled like real X embeds. Each card shows:
 *   - gradient avatar (we don't have profile pics — first letter on a brand
 *     gradient is the Twitter-card fallback look)
 *   - bold @handle + verified-style check if follower count >100k
 *   - relative time
 *   - cleaned tweet text (URLs and entities stripped to readable form)
 *   - engagement bar (replies / retweets / likes if available, total otherwise)
 *   - hover glow + click → original tweet on X
 */
export function RecentTweets({ tweets }: { tweets: TweetSnippet[] }) {
  if (tweets.length === 0) {
    return null;
  }
  const top = [...tweets]
    .sort((a, b) => b.engagement - a.engagement)
    .slice(0, 6);

  return (
    <div className="glass rounded-2xl p-5 sm:p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[10px] uppercase tracking-[0.2em] text-text-muted font-bold">
          Social signal · {tweets.length} posts
        </h3>
        <span className="text-[9.5px] uppercase tracking-[0.18em] text-text-muted">
          ranked by engagement
        </span>
      </div>
      <ul className="space-y-3">
        {top.map((t, i) => (
          <TweetCard key={i} tweet={t} />
        ))}
      </ul>
    </div>
  );
}

function TweetCard({ tweet }: { tweet: TweetSnippet }) {
  const verified = tweet.followers > 100_000;
  const cleanText = humanizeTweetText(tweet.text);
  const tweetUrl = tweet.url ?? `https://x.com/${tweet.handle}`;

  return (
    <li>
      <a
        href={tweetUrl}
        target="_blank"
        rel="noreferrer"
        className="block rounded-2xl border border-border-subtle px-4 py-3.5 hover:border-border-emphasized hover:bg-bg-elevated/40 transition group"
      >
        <div className="flex items-start gap-3">
          <Avatar handle={tweet.handle} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap mb-1">
              <span className="font-bold text-text-primary text-[13px] truncate">
                @{tweet.handle}
              </span>
              {verified && <VerifiedDot />}
              <span className="text-text-muted text-[11.5px]">·</span>
              <span className="text-text-muted text-[11.5px]">
                {ago(tweet.age_minutes)}
              </span>
              {tweet.followers > 0 && (
                <>
                  <span className="text-text-muted text-[11.5px]">·</span>
                  <span className="text-text-muted text-[11.5px] text-mono">
                    {humanizeNumber(tweet.followers)} followers
                  </span>
                </>
              )}
            </div>
            <p className="text-[13.5px] text-text-primary leading-[1.45]">
              {cleanText}
            </p>
            {tweet.engagement > 0 && (
              <div className="mt-2.5 flex items-center gap-4 text-[11px] text-text-muted">
                <Engagement icon="heart" value={tweet.engagement} />
              </div>
            )}
          </div>
        </div>
      </a>
    </li>
  );
}

function Avatar({ handle }: { handle: string }) {
  const seed = hashHandle(handle);
  // Pick gradient based on the handle so each user is consistent.
  const gradients = [
    "linear-gradient(135deg, #FF2D9C, #5E5CFF)",
    "linear-gradient(135deg, #5E5CFF, #14F195)",
    "linear-gradient(135deg, #14F195, #FF8B2D)",
    "linear-gradient(135deg, #FF8B2D, #FF2D9C)",
    "linear-gradient(135deg, #8A6BFF, #FF2D9C)",
  ];
  return (
    <span
      className="size-9 rounded-full shrink-0 flex items-center justify-center text-[13px] font-bold text-white"
      style={{ background: gradients[seed % gradients.length] }}
      aria-hidden
    >
      {handle.slice(0, 1).toUpperCase()}
    </span>
  );
}

function VerifiedDot() {
  // Small filled circle with a checkmark — matches Twitter's verified style
  return (
    <span
      title="100k+ followers"
      className="inline-flex items-center justify-center size-3.5 shrink-0 rounded-full"
      style={{ background: "#1da1f2", color: "#fff" }}
      aria-hidden
    >
      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 6 9 17l-5-5" />
      </svg>
    </span>
  );
}

function Engagement({ value }: { icon: "heart"; value: number }) {
  return (
    <span className="inline-flex items-center gap-1">
      <svg
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
      </svg>
      <span className="text-mono">{humanizeNumber(value)}</span>
    </span>
  );
}

function ago(minutes: number): string {
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 60 * 24) return `${Math.floor(minutes / 60)}h`;
  return `${Math.floor(minutes / 60 / 24)}d`;
}

function humanizeTweetText(raw: string): string {
  return raw
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/https:\/\/t\.co\/\w+/g, "") // drop t.co URLs
    .replace(/\s+/g, " ")
    .trim();
}

function hashHandle(handle: string): number {
  let h = 0;
  for (let i = 0; i < handle.length; i++) {
    h = (h * 31 + handle.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}
