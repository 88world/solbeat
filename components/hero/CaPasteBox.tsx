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

  const canSubmit = value.trim().length > 0;

  return (
    <form
      onSubmit={submit}
      className="relative w-full max-w-2xl mx-auto"
      autoComplete="off"
      role="search"
    >
      <div
        className={`relative flex items-center w-full p-2 rounded-3xl transition-all duration-500 ${
          error
            ? "border-signal-negative/40 shadow-[0_8px_32px_rgba(255,71,87,0.18)]"
            : focused
              ? "shadow-[0_10px_40px_rgba(255,45,156,0.18),0_0_0_1px_rgba(255,45,156,0.30)]"
              : "shadow-[0_10px_40px_rgba(10,10,30,0.06),0_0_0_1px_rgba(10,10,30,0.05)]"
        }`}
        style={{
          background: "rgba(255, 255, 255, 0.78)",
          backdropFilter: "blur(20px) saturate(160%)",
          WebkitBackdropFilter: "blur(20px) saturate(160%)",
          border: error
            ? "1px solid rgba(255, 71, 87, 0.4)"
            : "1px solid rgba(10, 10, 30, 0.05)",
        }}
      >
        <div className="pl-4 pr-2 text-text-muted">
          <SearchIcon focused={focused} />
        </div>
        <input
          ref={inputRef}
          type="text"
          inputMode="text"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder="Paste a Solana contract address…"
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
          className="flex-1 bg-transparent text-text-primary text-[15px] sm:text-[16px] text-mono placeholder:text-text-muted/85 outline-none px-1 py-3 min-w-0"
          aria-label="Solana token address"
        />
        {!focused && value.length === 0 && (
          <div className="hidden md:flex items-center gap-1 mr-2 pointer-events-none">
            <kbd
              className="text-[10px] text-text-muted text-mono px-1.5 py-0.5 rounded"
              style={{
                background: "rgba(10, 10, 30, 0.04)",
                border: "1px solid rgba(10, 10, 30, 0.06)",
              }}
            >
              ⌘V
            </kbd>
          </div>
        )}
        <button
          type="submit"
          disabled={pending || !canSubmit}
          className={`px-5 sm:px-7 h-[48px] sm:h-[52px] rounded-2xl font-bold text-[13px] tracking-tight transition-all duration-300 ${
            canSubmit
              ? "bg-text-primary text-bg-primary hover:bg-accent-pulse hover:scale-[1.03] active:scale-[0.97] shadow-[0_4px_16px_rgba(10,10,30,0.18)]"
              : "bg-text-muted/15 text-text-muted cursor-not-allowed"
          } disabled:opacity-60`}
        >
          {pending ? (
            <span className="inline-flex items-center gap-2">
              <span className="size-1.5 rounded-full bg-current animate-pulse" />
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
        <p className="mt-3 text-center text-[12px] text-signal-negative">
          {error}
        </p>
      )}
    </form>
  );
}

function SearchIcon({ focused }: { focused: boolean }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={focused ? 2.5 : 2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`transition-colors ${focused ? "text-text-primary" : "text-text-muted"}`}
      aria-hidden
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}
