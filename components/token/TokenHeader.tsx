"use client";

import { useState } from "react";
import type { TokenAnalysis } from "@/types/token";
import { shortAddress } from "@/lib/utils";

export function TokenHeader({ analysis }: { analysis: TokenAnalysis }) {
  const { metadata } = analysis;
  const [copied, setCopied] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);

  const copyCa = async () => {
    try {
      await navigator.clipboard.writeText(metadata.ca);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* noop */
    }
  };

  const showImage = metadata.image && !imgFailed;
  const symbol = metadata.symbol?.replace(/^\$/, "").toUpperCase() ?? "";

  return (
    <div className="flex items-start gap-4">
      <div
        className="size-16 sm:size-20 rounded-2xl overflow-hidden flex items-center justify-center shrink-0"
        style={{
          background: "rgba(255, 255, 255, 0.7)",
          border: "1px solid rgba(10, 10, 30, 0.06)",
          boxShadow: "0 6px 16px rgba(10, 10, 30, 0.05)",
        }}
      >
        {showImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={metadata.image!}
            alt={metadata.symbol ?? "token"}
            className="size-full object-cover"
            referrerPolicy="no-referrer"
            loading="lazy"
            onError={() => setImgFailed(true)}
          />
        ) : (
          <div
            className="size-full flex items-center justify-center text-[14px] font-bold text-white tracking-wide"
            style={{
              background:
                "linear-gradient(135deg, #ff2d9c 0%, #5e5cff 60%, #14f195 100%)",
            }}
          >
            {symbol.slice(0, 3) || "-"}
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="text-[28px] sm:text-[36px] font-semibold leading-tight tracking-tight text-text-primary">
            {metadata.name ?? "Unknown token"}
          </h1>
          {metadata.symbol && (
            <span className="text-[14px] text-text-secondary text-mono">
              ${metadata.symbol}
            </span>
          )}
        </div>

        <div className="mt-2 flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={copyCa}
            className="inline-flex items-center gap-2 px-2 py-1 rounded-md text-[11px] text-mono text-text-secondary hover:text-text-primary hover:bg-text-muted/10 transition"
            title={metadata.ca}
          >
            <span>{shortAddress(metadata.ca, 6, 6)}</span>
            <span className="text-text-muted">·</span>
            <span className="text-text-muted">{copied ? "Copied" : "Copy"}</span>
          </button>

          <span className="text-text-muted text-[10px]">·</span>

          <ExternalLink
            href={`https://solscan.io/token/${metadata.ca}`}
            label="Solscan"
          />
          <ExternalLink
            href={`https://birdeye.so/token/${metadata.ca}?chain=solana`}
            label="Birdeye"
          />
          <ExternalLink
            href={`https://dexscreener.com/solana/${metadata.ca}`}
            label="DexScreener"
          />
          {metadata.symbol && (
            <ExternalLink
              href={`https://x.com/search?q=%24${encodeURIComponent(metadata.symbol)}&src=typed_query&f=live`}
              label="X feed"
            />
          )}

          <ShareOnX
            symbol={metadata.symbol}
            name={metadata.name}
            ca={metadata.ca}
          />
        </div>
      </div>
    </div>
  );
}

function ShareOnX({
  symbol,
  name,
  ca,
}: {
  symbol: string | null;
  name: string | null;
  ca: string;
}) {
  // Built client-side so the URL anchors to the user's actual origin (works
  // on localhost during dev, on the deployed domain in prod). The X intent
  // URL fires in a new tab; X scrapes our /opengraph-image and embeds the
  // generated card automatically.
  const onClick = () => {
    if (typeof window === "undefined") return;
    const tokenUrl = `${window.location.origin}/token/${ca}`;
    const headline = symbol
      ? `$${symbol.replace(/^\$/, "").toUpperCase()} on SolBeat, read the pulse:`
      : `${name ?? "This Solana token"} on SolBeat, read the pulse:`;
    const intent = `https://twitter.com/intent/tweet?text=${encodeURIComponent(
      headline,
    )}&url=${encodeURIComponent(tokenUrl)}`;
    window.open(intent, "_blank", "noreferrer,noopener");
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10.5px] font-semibold text-text-primary bg-text-primary/[0.06] hover:bg-text-primary/[0.10] transition"
      title="Share this token on X"
    >
      <svg
        width="11"
        height="11"
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden
      >
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
      Share
    </button>
  );
}

function ExternalLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10.5px] font-semibold text-text-secondary hover:text-text-primary hover:bg-text-muted/10 transition"
    >
      {label}
      <span className="text-[8px] text-text-muted" aria-hidden>↗</span>
    </a>
  );
}
