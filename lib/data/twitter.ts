import type { TweetSnippet } from "@/types/token";
import { LIMITS } from "@/config/constants";

const KEY = process.env.TWITTERAPI_IO_KEY ?? "";

// twitterapi.io exposes tweet search. Endpoint shape per their docs:
//   GET https://api.twitterapi.io/twitter/tweet/advanced_search?query=...&queryType=Latest
// We pass the API key via x-api-key header.

type TwApiResponse = {
  tweets?: Array<{
    id?: string;
    url?: string;
    text?: string;
    createdAt?: string;
    likeCount?: number;
    retweetCount?: number;
    replyCount?: number;
    viewCount?: number;
    author?: {
      userName?: string;
      name?: string;
      /** Different snapshots of the API expose this field under different names. */
      profilePicture?: string;
      profile_image_url?: string;
      profile_image_url_https?: string;
      avatar?: string;
      followers?: number;
      isBlueVerified?: boolean;
      isVerified?: boolean;
      verified?: boolean;
    };
  }>;
};

export async function fetchRecentTweets(
  symbol: string,
  ca: string,
): Promise<TweetSnippet[]> {
  if (!KEY) return [];

  // Search for either the symbol with $ prefix or the contract address.
  const query = encodeURIComponent(`($${symbol} OR ${ca}) lang:en -is:retweet`);
  const url = `https://api.twitterapi.io/twitter/tweet/advanced_search?query=${query}&queryType=Latest`;

  try {
    const r = await fetch(url, {
      headers: { "x-api-key": KEY, accept: "application/json" },
      next: { revalidate: 60 },
    });
    if (!r.ok) return [];
    const json = (await r.json()) as TwApiResponse;
    const tweets = json.tweets ?? [];

    return tweets
      .slice(0, LIMITS.TWEETS_FOR_SYNTHESIS)
      .map<TweetSnippet>((t) => {
        const engagement =
          (t.likeCount ?? 0) + (t.retweetCount ?? 0) + (t.replyCount ?? 0);
        const created = t.createdAt ? new Date(t.createdAt) : new Date();
        const ageMin = Math.max(0, Math.floor((Date.now() - created.getTime()) / 60000));
        const author = t.author;
        const rawAvatar =
          author?.profilePicture ??
          author?.profile_image_url_https ??
          author?.profile_image_url ??
          author?.avatar ??
          null;
        // X serves _normal (48px) variants by default — request 200x200 for retina.
        const avatar = rawAvatar
          ? rawAvatar.replace(/_normal\.(jpg|jpeg|png|gif)/i, "_200x200.$1")
          : null;
        const verified =
          author?.isBlueVerified === true ||
          author?.isVerified === true ||
          author?.verified === true;
        return {
          handle: author?.userName ?? "unknown",
          display_name: author?.name ?? null,
          avatar_url: avatar,
          verified,
          followers: author?.followers ?? 0,
          text: (t.text ?? "").replace(/\s+/g, " ").trim(),
          engagement,
          url: t.url ?? null,
          age_minutes: ageMin,
        };
      })
      .filter((t) => t.text.length > 0)
      .sort((a, b) => b.engagement - a.engagement);
  } catch {
    return [];
  }
}
