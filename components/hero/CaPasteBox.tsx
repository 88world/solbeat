"use client";

import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
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
  const [focused, setFocused] = useState(false);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  // ⌘V / Ctrl+V anywhere on the page focuses the paste box.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === "v" && document.activeElement !== inputRef.current) {
        // Don't steal from existing inputs.
        const tag = (document.activeElement as HTMLElement | null)?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA") return;
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function go(parsed: ReturnType<typeof parseInput>) {
    if (parsed.kind === "address") {
      onPulse?.("valid");
      setError(null);
      startTransition(() => router.push(`/token/${parsed.value}`));
      return true;
    }
    if (parsed.kind === "ticker") {
      onPulse?.("valid");
      setError(null);
      startTransition(() => router.push(`/search?q=${encodeURIComponent(parsed.value)}`));
      return true;
    }
    return false;
  }

  function submit(e?: FormEvent) {
    e?.preventDefault();
    const parsed = parseInput(value);
    if (!go(parsed)) {
      onPulse?.("invalid");
      setError("That doesn't look like a Solana address or ticker.");
    }
  }

  return (
    <form
      onSubmit={submit}
      className="relative w-full"
      autoComplete="off"
      role="search"
    >
      <div
        className={`relative rounded-full transition-all duration-300 ${
          error
            ? "shadow-[0_0_0_1px_rgba(255,71,87,0.5),0_0_60px_rgba(255,71,87,0.18)]"
            : focused
              ? "shadow-[0_0_0_1px_rgba(255,255,255,0.18),0_0_80px_rgba(255,45,156,0.28),0_20px_60px_rgba(0,0,0,0.5)]"
              : "shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_0_40px_rgba(153,69,255,0.10),0_12px_40px_rgba(0,0,0,0.4)]"
        }`}
        style={{
          background:
            "linear-gradient(180deg, rgba(28, 28, 38, 0.85), rgba(18, 18, 26, 0.85))",
          backdropFilter: "blur(24px) saturate(140%)",
          WebkitBackdropFilter: "blur(24px) saturate(140%)",
        }}
      >
        <SearchIcon
          className={`absolute left-5 top-1/2 -translate-y-1/2 size-[18px] transition-colors ${
            focused ? "text-text-primary" : "text-text-muted"
          }`}
        />
        <input
          ref={inputRef}
          type="text"
          inputMode="text"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder="Paste a Solana token address"
          value={value}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onChange={(e) => {
            setValue(e.target.value);
            if (error) setError(null);
          }}
          onPaste={(e) => {
            const pasted = e.clipboardData.getData("text").trim();
            if (pasted.length >= 32) {
              setTimeout(() => {
                setValue(pasted);
                go(parseInput(pasted));
              }, 30);
            }
          }}
          className="w-full h-[64px] sm:h-[68px] bg-transparent text-text-primary text-[15px] sm:text-[16px] text-mono pl-[52px] pr-[140px] rounded-full outline-none placeholder:text-text-muted/80"
          aria-label="Solana token address"
        />
        <KbdHint visible={!focused && value.length === 0} />
        <button
          type="submit"
          disabled={pending}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 h-[52px] sm:h-[56px] px-5 sm:px-6 rounded-full font-semibold text-[13px] tracking-tight transition-all hover:scale-[1.03] active:scale-[0.98] disabled:opacity-50 disabled:scale-100"
          style={{
            background:
              "linear-gradient(135deg, #ffffff 0%, #f0f0f5 100%)",
            color: "#0a0a0f",
            boxShadow:
              "0 4px 16px rgba(255, 45, 156, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.6)",
          }}
        >
          {pending ? (
            <span className="inline-flex items-center gap-2">
              <span className="size-1.5 rounded-full bg-accent-pulse animate-pulse" />
              Reading
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5">
              Read pulse
              <span aria-hidden>→</span>
            </span>
          )}
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

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

function KbdHint({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <div className="hidden md:flex absolute right-[148px] top-1/2 -translate-y-1/2 items-center gap-1 pointer-events-none">
      <kbd className="text-[10px] text-text-muted bg-white/[0.06] border border-white/[0.08] rounded px-1.5 py-0.5 text-mono">
        ⌘V
      </kbd>
      <span className="text-[10px] text-text-muted">paste</span>
    </div>
  );
}
