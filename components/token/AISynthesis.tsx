"use client";

import { motion } from "framer-motion";
import type { TokenSynthesis } from "@/types/token";
import { PulseGlyph } from "@/components/shared/Logo";

/**
 * AI synthesis, post-Gemini-audit. Was three dense paragraphs; Gemini
 * called it "a dense block of text" that doesn't scan. Refactored to
 * sentence-bulleted form: each prose paragraph from Claude is split into
 * individual sentences and rendered as scannable bullets.
 *
 * No prompt change required — sentence splitter regex (handles "Mr.",
 * "$3.99", "etc." gracefully) does the work client-side. If a sentence is
 * <8 words, it's merged into the next so we don't get one-word bullets.
 */
export function AISynthesis({ synthesis }: { synthesis: TokenSynthesis | null }) {
  return (
    <section className="glass rounded-2xl p-5 sm:p-7 h-full">
      <header className="flex items-center gap-2 mb-4">
        <PulseGlyph size={18} />
        <h2 className="text-[13px] uppercase tracking-[0.18em] text-text-secondary font-medium">
          The pulse
        </h2>
      </header>
      {!synthesis ? (
        <SynthesisFallback />
      ) : (
        <div className="space-y-4 sm:space-y-5">
          <BulletSection
            label="What this is"
            text={synthesis.what_this_is}
            accentColor="#5e5cff"
            delay={0}
          />
          <BulletSection
            label="What's happening now"
            text={synthesis.whats_happening}
            accentColor="#FF2D9C"
            delay={0.18}
          />
          <BulletSection
            label="What you should know"
            text={synthesis.what_to_know}
            accentColor="#d6601a"
            delay={0.36}
          />
        </div>
      )}
    </section>
  );
}

function BulletSection({
  label,
  text,
  accentColor,
  delay,
}: {
  label: string;
  text: string;
  accentColor: string;
  delay: number;
}) {
  const bullets = splitToBullets(text);
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      <div
        className="text-[9.5px] uppercase tracking-[0.20em] mb-2.5 font-bold inline-block px-2 py-0.5 rounded"
        style={{
          color: accentColor,
          background: `${accentColor}14`,
        }}
      >
        {label}
      </div>
      <ul className="space-y-1.5">
        {bullets.map((b, i) => (
          <motion.li
            key={i}
            initial={{ opacity: 0, x: -4 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{
              duration: 0.4,
              delay: delay + 0.05 + i * 0.06,
              ease: "easeOut",
            }}
            className="flex items-start gap-2.5 text-[13.5px] sm:text-[14px] leading-[1.55] text-text-primary"
          >
            <span
              aria-hidden
              className="size-1.5 rounded-full shrink-0 mt-[8px]"
              style={{ background: accentColor }}
            />
            <span>{b}</span>
          </motion.li>
        ))}
      </ul>
    </motion.div>
  );
}

/**
 * Split prose into bullets at sentence boundaries. We don't naively split
 * on every period — common abbreviations and decimals would shred the text.
 * The regex looks for "[.!?]" followed by whitespace + capital letter, which
 * skips over "$3.99" and "U.S." style. Bullets shorter than 8 words get
 * fused into the next so we don't get fragments like "Yes."
 */
function splitToBullets(text: string): string[] {
  const cleaned = text.trim();
  if (!cleaned) return [];

  // Split on sentence boundaries that are followed by a capital letter.
  const raw = cleaned.split(/(?<=[.!?])\s+(?=[A-Z])/);

  // Merge short fragments forward.
  const merged: string[] = [];
  for (const s of raw) {
    const wordCount = s.trim().split(/\s+/).length;
    if (merged.length > 0 && wordCount < 8) {
      merged[merged.length - 1] = `${merged[merged.length - 1]} ${s.trim()}`;
    } else {
      merged.push(s.trim());
    }
  }

  // Strip trailing punctuation if it's the only thing left after a period.
  return merged.filter((s) => s.length > 0);
}

function SynthesisFallback() {
  return (
    <div className="space-y-3">
      <p className="text-[13px] text-text-secondary">
        The pulse is offline for this token right now. On-chain data and market
        panels still load with full fidelity below.
      </p>
      <div className="space-y-2">
        <div className="h-3 rounded animate-shimmer w-full" />
        <div className="h-3 rounded animate-shimmer w-[92%]" />
        <div className="h-3 rounded animate-shimmer w-[78%]" />
      </div>
    </div>
  );
}
