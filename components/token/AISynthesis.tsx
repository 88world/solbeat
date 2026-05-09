"use client";

import { motion } from "framer-motion";
import type { TokenSynthesis } from "@/types/token";
import { PulseGlyph } from "@/components/shared/Logo";

export function AISynthesis({ synthesis }: { synthesis: TokenSynthesis | null }) {
  return (
    <section className="glass rounded-2xl p-5 sm:p-7">
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
          <Paragraph
            label="What this is"
            text={synthesis.what_this_is}
            delay={0}
          />
          <Paragraph
            label="What's happening now"
            text={synthesis.whats_happening}
            delay={0.18}
            accent
          />
          <Paragraph
            label="What you should know"
            text={synthesis.what_to_know}
            delay={0.36}
          />
        </div>
      )}
    </section>
  );
}

function Paragraph({
  label,
  text,
  delay,
  accent = false,
}: {
  label: string;
  text: string;
  delay: number;
  accent?: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      <div
        className={`text-[10px] uppercase tracking-[0.2em] mb-2 ${
          accent ? "text-accent-pulse" : "text-text-muted"
        }`}
      >
        {label}
      </div>
      <p className="text-[15px] sm:text-[16px] leading-[1.65] text-text-primary">
        {text}
      </p>
    </motion.div>
  );
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
