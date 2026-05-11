import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Canonical-host redirect.
 *
 * Vercel keeps the auto-generated `*.vercel.app` URL live alongside the
 * custom domain. When someone lands on the .vercel.app variant, every
 * internal `<Link href="/...">` inherits that origin — so the UI subtly
 * advertises the wrong domain on hover, in shared screenshots, in OG
 * embeds. We 308 production .vercel.app traffic to solbeat.blockvalley.io
 * so the custom domain is the only public surface.
 *
 * Gates:
 *   - Only in production (Preview deployments must stay on their preview
 *     host so they actually work).
 *   - Only when host ends with `.vercel.app` (custom-domain requests pass
 *     through untouched).
 *   - 308 (permanent, method-preserving) so browsers and crawlers cache
 *     the canonical mapping.
 */
const CANONICAL_HOST = "solbeat.blockvalley.io";

export function middleware(req: NextRequest) {
  if (process.env.VERCEL_ENV !== "production") {
    return NextResponse.next();
  }
  const host = req.headers.get("host") ?? "";
  if (!host.endsWith(".vercel.app")) {
    return NextResponse.next();
  }
  const url = new URL(req.url);
  url.host = CANONICAL_HOST;
  url.protocol = "https:";
  url.port = "";
  return NextResponse.redirect(url, 308);
}

export const config = {
  // Match everything except Next.js internals + static assets. The image
  // optimizer, RSC payloads, and prefetched routes all live under /_next
  // and shouldn't pay the redirect cost.
  matcher: ["/((?!_next/|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|woff|woff2|ttf|otf)$).*)"],
};
