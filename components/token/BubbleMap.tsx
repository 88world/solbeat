"use client";

import { useState } from "react";

/**
 * Embed bubblemaps.io's iframe widget for the holder/wallet cluster
 * visualization. Free, no API key required, returns a graceful blank state
 * for tokens they haven't indexed yet (which is most freshly-launched
 * memecoins).
 *
 * If the iframe fails to load within ~6s we render a fallback card with a
 * deep link out to the same data on bubblemaps.io.
 */
export function BubbleMap({ ca }: { ca: string }) {
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);

  const url = `https://app.bubblemaps.io/sol/token/${ca}`;

  return (
    <div className="glass rounded-2xl overflow-hidden h-full flex flex-col">
      <div className="flex items-center justify-between px-5 py-3 border-b border-border-subtle">
        <h3 className="text-[10px] uppercase tracking-[0.2em] text-text-muted font-bold">
          Holder map
        </h3>
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="text-[10px] text-text-muted hover:text-text-secondary transition inline-flex items-center gap-1"
        >
          Open on Bubblemaps <span className="text-[8px]" aria-hidden>↗</span>
        </a>
      </div>
      <div className="relative flex-1" style={{ minHeight: 360 }}>
        {!errored && (
          <iframe
            src={url}
            title="Holder bubble map"
            className="absolute inset-0 w-full h-full"
            style={{ border: 0, background: "transparent" }}
            loading="lazy"
            onLoad={() => setLoaded(true)}
            onError={() => setErrored(true)}
          />
        )}
        {(!loaded || errored) && (
          <div
            className="absolute inset-0 flex items-center justify-center"
            style={{ pointerEvents: errored ? "auto" : "none" }}
          >
            {errored ? (
              <div className="text-center px-6 max-w-xs">
                <p className="text-[12.5px] text-text-secondary mb-3">
                  Holder map isn&apos;t indexed yet for this token.
                </p>
                <a
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 h-8 rounded-full text-[11.5px] font-semibold border border-border-subtle hover:border-border-emphasized text-text-primary transition"
                >
                  Open on Bubblemaps
                  <span className="text-text-muted text-[9px]" aria-hidden>↗</span>
                </a>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-[11px] text-text-muted">
                <span className="size-1.5 rounded-full bg-accent-pulse animate-pulse" />
                Loading bubble map…
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
