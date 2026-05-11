"use client";

import type { TweetSnippet } from "@/types/token";
import { humanizeNumber } from "@/lib/utils";

/**
 * Tweet feed styled like real X embeds. Each card shows:
 *   - gradient avatar (we don't have profile pics, first letter on a brand
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
  // Two-tier sort: verified / >100K-follower accounts first, then by
  // engagement within each tier. A blue-check with 80 likes is more
  // signal than an anonymous account with 800 likes, so the tier ranking
  // dominates the engagement count.
  const tier = (t: TweetSnippet): number =>
    t.verified || t.followers > 100_000 ? 1 : 0;
  const top = [...tweets]
    .sort((a, b) => {
      const tierDiff = tier(b) - tier(a);
      if (tierDiff !== 0) return tierDiff;
      return b.engagement - a.engagement;
    })
    .slice(0, 6);

  // Aggregate stats for the header.
  const totalEngagement = tweets.reduce((acc, t) => acc + t.engagement, 0);
  const verifiedCount = tweets.filter(
    (t) => t.verified || t.followers > 100_000,
  ).length;

  return (
    <div className="glass rounded-2xl p-5 sm:p-6">
      <div className="flex items-baseline justify-between mb-4 flex-wrap gap-2">
        <div>
          <h3 className="text-[14px] font-bold tracking-tight text-text-primary leading-tight">
            Social signal
          </h3>
          <p className="text-[11px] text-text-muted mt-0.5 leading-relaxed">
            {tweets.length} posts ·{" "}
            <span className="text-mono">
              {humanizeNumber(totalEngagement)}
            </span>{" "}
            engagement ·{" "}
            <span className="text-mono">{verifiedCount}</span> from blue-checks
          </p>
        </div>
        <span className="text-[9.5px] uppercase tracking-[0.20em] text-text-muted font-bold">
          blue-checks first
        </span>
      </div>
      {/* Two-column dense grid on wider screens so we can fit more cards
          before the user has to scroll. Single column on mobile. */}
      <ul className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
        {top.map((t, i) => (
          <TweetCard key={i} tweet={t} />
        ))}
      </ul>
    </div>
  );
}

function TweetCard({ tweet }: { tweet: TweetSnippet }) {
  // Either the upstream marked the account verified, OR it's >100k followers
  // (cheap proxy when the upstream doesn't surface verification status).
  const verified = tweet.verified || tweet.followers > 100_000;
  const cleanText = humanizeTweetText(tweet.text);
  const tweetUrl = tweet.url ?? `https://x.com/${tweet.handle}`;
  const displayName = tweet.display_name?.trim();

  // Reach tier — drives the card's accent stripe color. Big accounts get
  // a brand-pink stripe; tier 2 gets violet; everyone else neutral.
  const reachTier =
    tweet.followers >= 100_000
      ? { color: "#FF2D9C", label: "Whale" }
      : tweet.followers >= 10_000
        ? { color: "#5e5cff", label: "Mid" }
        : null;

  return (
    <li>
      <a
        href={tweetUrl}
        target="_blank"
        rel="noreferrer"
        className="block rounded-xl px-3.5 py-3 hover:scale-[1.01] transition-all relative overflow-hidden h-full group"
        style={{
          background: "var(--glass-soft)",
          border: "1px solid var(--border-subtle)",
        }}
      >
        {/* Reach-tier side stripe. Whale = pink, mid = violet, everyone
            else no stripe. Quick visual hierarchy without reading numbers. */}
        {reachTier && (
          <div
            aria-hidden
            className="absolute left-0 top-0 bottom-0 w-[3px]"
            style={{
              background: `linear-gradient(180deg, ${reachTier.color}aa, ${reachTier.color}33)`,
            }}
          />
        )}
        <div className="flex items-start gap-2.5 relative">
          <Avatar handle={tweet.handle} avatarUrl={tweet.avatar_url} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 mb-1 flex-wrap">
              {displayName && (
                <span className="font-bold text-text-primary text-[12.5px] truncate max-w-[140px]">
                  {displayName}
                </span>
              )}
              {verified && <VerifiedDot />}
              <span className="text-text-muted text-[11px] truncate text-mono">
                @{tweet.handle}
              </span>
              <span className="text-text-muted text-[10.5px] ml-auto shrink-0">
                {ago(tweet.age_minutes)}
              </span>
            </div>
            <p className="text-[12.5px] text-text-primary leading-[1.45] line-clamp-3">
              {cleanText}
            </p>
            <div className="mt-2 flex items-center gap-3 text-[10px] text-text-muted">
              {tweet.followers > 0 && (
                <span className="text-mono">
                  {humanizeNumber(tweet.followers)} followers
                </span>
              )}
              {tweet.engagement > 0 && (
                <Engagement icon="heart" value={tweet.engagement} />
              )}
              {reachTier && (
                <span
                  className="ml-auto text-[8.5px] uppercase tracking-[0.16em] font-bold"
                  style={{ color: reachTier.color }}
                >
                  {reachTier.label}
                </span>
              )}
            </div>
          </div>
        </div>
      </a>
    </li>
  );
}

function Avatar({ handle, avatarUrl }: { handle: string; avatarUrl: string | null }) {
  const seed = hashHandle(handle);
  // Pick gradient based on the handle so each user is consistent (used as
  // background while the avatar loads, and as fallback if it 404s).
  const gradients = [
    "linear-gradient(135deg, #FF2D9C, #5E5CFF)",
    "linear-gradient(135deg, #5E5CFF, #14F195)",
    "linear-gradient(135deg, #14F195, #FF8B2D)",
    "linear-gradient(135deg, #FF8B2D, #FF2D9C)",
    "linear-gradient(135deg, #8A6BFF, #FF2D9C)",
  ];
  const gradient = gradients[seed % gradients.length];

  // Always render the gradient + initial as a base layer, then overlay the
  // <img> on top. If the img fails to load, hiding it reveals the fallback
  // underneath. No onError handler needed, the browser just shows the alt
  // styling, and our object-cover img stays hidden on broken src.
  return (
    <span
      className="relative size-9 rounded-full shrink-0 overflow-hidden flex items-center justify-center text-[13px] font-bold text-white"
      style={{ background: gradient }}
    >
      <span aria-hidden>{handle.slice(0, 1).toUpperCase()}</span>
      {avatarUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={avatarUrl}
          alt={`${handle} avatar`}
          loading="lazy"
          referrerPolicy="no-referrer"
          className="absolute inset-0 size-full object-cover"
          onError={(e) => {
            // 404 / 403 → just hide the <img>; the gradient initial below shows through.
            (e.currentTarget as HTMLImageElement).style.display = "none";
          }}
        />
      )}
    </span>
  );
}

function VerifiedDot() {
  // Small filled circle with a checkmark, matches Twitter's verified style
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
