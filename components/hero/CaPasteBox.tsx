"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { parseInput } from "@/lib/solana/validation";

export function CaPasteBox({
  onPulse,
}: {
  onPulse?: (kind: "valid" | "invalid") => void;
}) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function submit(e?: FormEvent) {
    e?.preventDefault();
    const parsed = parseInput(value);
    if (parsed.kind === "address") {
      onPulse?.("valid");
      setError(null);
      startTransition(() => {
        router.push(`/token/${parsed.value}`);
      });
      return;
    }
    if (parsed.kind === "ticker") {
      onPulse?.("valid");
      setError(null);
      startTransition(() => {
        router.push(`/search?q=${encodeURIComponent(parsed.value)}`);
      });
      return;
    }
    onPulse?.("invalid");
    setError("That doesn't look like a Solana address or ticker.");
  }

  return (
    <form
      onSubmit={submit}
      className="relative w-full max-w-[640px] mx-auto"
      autoComplete="off"
    >
      <div
        className={`relative rounded-full glass border transition-all ${
          error
            ? "border-signal-negative/60 shadow-[0_0_40px_rgba(255,71,87,0.18)]"
            : "border-emphasized hover:border-white/20 focus-within:border-white/30 focus-within:shadow-[0_0_60px_rgba(153,69,255,0.18)]"
        }`}
      >
        <input
          type="text"
          inputMode="text"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder="Paste any Solana token address"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            if (error) setError(null);
          }}
          onPaste={(e) => {
            // If they pasted a single CA, auto-submit after a tick.
            const pasted = e.clipboardData.getData("text").trim();
            if (pasted.length >= 32) {
              setTimeout(() => {
                setValue(pasted);
                const parsed = parseInput(pasted);
                if (parsed.kind === "address") {
                  onPulse?.("valid");
                  startTransition(() => router.push(`/token/${parsed.value}`));
                }
              }, 30);
            }
          }}
          className="w-full h-[64px] sm:h-[72px] bg-transparent text-text-primary text-[16px] sm:text-[17px] text-mono pl-6 pr-28 rounded-full outline-none placeholder:text-text-muted"
          aria-label="Solana token address"
        />
        <button
          type="submit"
          disabled={pending}
          className="absolute right-2 top-1/2 -translate-y-1/2 h-[48px] sm:h-[56px] px-5 sm:px-6 rounded-full bg-white text-black font-medium text-[14px] hover:bg-white/90 transition disabled:opacity-50"
        >
          {pending ? "Reading…" : "Read pulse"}
        </button>
      </div>
      {error && (
        <p className="absolute -bottom-7 left-1/2 -translate-x-1/2 text-[12px] text-signal-negative whitespace-nowrap">
          {error}
        </p>
      )}
    </form>
  );
}
