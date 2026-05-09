"use client";

import {
  useEffect,
  useRef,
  useState,
  useTransition,
  type FormEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { useRouter } from "next/navigation";
import { parseInput, isValidSolanaAddress } from "@/lib/solana/validation";

type Ripple = { id: number; x: number; y: number };

export function CaPasteBox({
  onPulse,
}: {
  onPulse?: (kind: "valid" | "invalid") => void;
}) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [focused, setFocused] = useState(false);
  const [justPasted, setJustPasted] = useState(false);
  const [ripples, setRipples] = useState<Ripple[]>([]);
  const [magnet, setMagnet] = useState({ x: 0, y: 0 });
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Real-time validation — check whenever value changes
  const trimmed = value.trim();
  const valid = isValidSolanaAddress(trimmed);
  const tooShort = trimmed.length > 0 && trimmed.length < 32;
  const wrongShape =
    trimmed.length >= 32 && !valid && !/^\$?[A-Za-z]{2,10}$/.test(trimmed);

  // ⌘V / Ctrl+V anywhere on the page focuses the paste box.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (
        meta &&
        e.key.toLowerCase() === "v" &&
        document.activeElement !== inputRef.current
      ) {
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
      startTransition(() =>
        router.push(`/search?q=${encodeURIComponent(parsed.value)}`),
      );
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

  // Magnetic button — translates a few px toward the cursor when hovered
  const onButtonMove = (e: ReactMouseEvent<HTMLButtonElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const dx = (e.clientX - (r.left + r.width / 2)) * 0.18;
    const dy = (e.clientY - (r.top + r.height / 2)) * 0.22;
    setMagnet({ x: dx, y: dy });
  };
  const onButtonLeave = () => setMagnet({ x: 0, y: 0 });

  // Ripple on click — short-lived animated span at click position
  const spawnRipple = (e: ReactMouseEvent<HTMLButtonElement>) => {
    if (!buttonRef.current) return;
    const r = buttonRef.current.getBoundingClientRect();
    const id = Date.now() + Math.random();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    setRipples((rs) => [...rs, { id, x, y }]);
    setTimeout(() => {
      setRipples((rs) => rs.filter((rp) => rp.id !== id));
    }, 700);
  };

  const canSubmit = trimmed.length > 0;

  return (
    <form
      onSubmit={submit}
      className="relative w-full max-w-2xl mx-auto"
      autoComplete="off"
      role="search"
    >
      <div className="relative">
        {/* Animated gradient ring on focus */}
        <div
          aria-hidden
          className={`pointer-events-none absolute -inset-px rounded-3xl transition-opacity duration-500 ${
            focused && !error ? "opacity-100" : "opacity-0"
          }`}
          style={{
            background:
              "linear-gradient(110deg, #FF2D9C, #5E5CFF 45%, #14F195 80%, #FF2D9C 110%)",
            backgroundSize: "220% 100%",
            animation: focused ? "text-shimmer 4s linear infinite" : "none",
            filter: "blur(0.5px)",
          }}
        />

        <div
          className={`relative flex items-center w-full p-2 rounded-3xl transition-all duration-500 ${
            error
              ? "shadow-[0_8px_32px_rgba(255,71,87,0.18)]"
              : justPasted
                ? "shadow-[0_18px_50px_rgba(20,241,149,0.25)]"
                : focused
                  ? "shadow-[0_18px_50px_rgba(255,45,156,0.18)]"
                  : "shadow-[0_10px_40px_rgba(10,10,30,0.06),0_0_0_1px_rgba(10,10,30,0.05)]"
          }`}
          style={{
            background: "rgba(255, 255, 255, 0.86)",
            backdropFilter: "blur(20px) saturate(160%)",
            WebkitBackdropFilter: "blur(20px) saturate(160%)",
            border: error
              ? "1px solid rgba(255, 71, 87, 0.4)"
              : focused
                ? "1px solid transparent"
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
                setJustPasted(true);
                setTimeout(() => setJustPasted(false), 800);
                setTimeout(() => {
                  setValue(pasted);
                  go(parseInput(pasted));
                }, 30);
              }
            }}
            className="flex-1 bg-transparent text-text-primary text-[15px] sm:text-[16px] text-mono placeholder:text-text-muted/85 outline-none px-1 py-3 min-w-0"
            aria-label="Solana token address"
          />

          {/* Validation badge — slides in when state changes */}
          <div className="flex items-center gap-2 mr-1.5 shrink-0">
            <ValidationBadge
              valid={valid}
              tooShort={tooShort}
              wrongShape={wrongShape}
              empty={trimmed.length === 0}
              focused={focused}
            />
          </div>

          {/* ⌘V hint — only when empty + unfocused */}
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

          {/* Magnetic + rippling submit button */}
          <button
            ref={buttonRef}
            type="submit"
            disabled={pending || !canSubmit}
            onMouseMove={onButtonMove}
            onMouseLeave={onButtonLeave}
            onMouseDown={spawnRipple}
            className={`relative overflow-hidden px-5 sm:px-7 h-[48px] sm:h-[52px] rounded-2xl font-bold text-[13px] tracking-tight transition-all ${
              canSubmit
                ? "bg-text-primary text-bg-primary hover:scale-[1.04] active:scale-[0.97] shadow-[0_4px_16px_rgba(10,10,30,0.18)]"
                : "bg-text-muted/15 text-text-muted cursor-not-allowed"
            } disabled:opacity-60`}
            style={{
              transform: canSubmit
                ? `translate(${magnet.x}px, ${magnet.y}px)`
                : undefined,
              transition: "transform 200ms cubic-bezier(0.22,1,0.36,1), background 300ms, color 300ms, box-shadow 300ms",
              background: canSubmit
                ? `linear-gradient(110deg, #0a0a14 0%, #0a0a14 50%, ${
                    valid ? "#FF2D9C" : "#1f1f30"
                  } 100%)`
                : undefined,
            }}
          >
            {/* Cursor-following highlight inside the button */}
            {canSubmit && (
              <span
                aria-hidden
                className="absolute inset-0 pointer-events-none opacity-0 hover:opacity-100"
                style={{
                  background: `radial-gradient(120px circle at ${50 + magnet.x * 6}% ${
                    50 + magnet.y * 6
                  }%, rgba(255,45,156,0.45), transparent 65%)`,
                }}
              />
            )}

            {/* Click ripples */}
            {ripples.map((r) => (
              <span
                key={r.id}
                aria-hidden
                className="pointer-events-none absolute rounded-full"
                style={{
                  left: r.x,
                  top: r.y,
                  width: 12,
                  height: 12,
                  marginLeft: -6,
                  marginTop: -6,
                  background: "rgba(255, 255, 255, 0.55)",
                  animation: "ripple 700ms cubic-bezier(0.22,1,0.36,1) forwards",
                }}
              />
            ))}

            <span className="relative z-10">
              {pending ? (
                <span className="inline-flex items-center gap-2">
                  <span className="size-1.5 rounded-full bg-current animate-pulse" />
                  Reading
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5">
                  Read pulse
                  <span
                    aria-hidden
                    className="transition-transform duration-300 group-hover:translate-x-0.5"
                  >
                    →
                  </span>
                </span>
              )}
            </span>
          </button>
        </div>
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

/** Live validation pill — shifts color/icon as the user types. */
function ValidationBadge({
  valid,
  tooShort,
  wrongShape,
  empty,
  focused,
}: {
  valid: boolean;
  tooShort: boolean;
  wrongShape: boolean;
  empty: boolean;
  focused: boolean;
}) {
  if (empty) return null;

  if (valid) {
    return (
      <div
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10.5px] font-bold animate-fade-in"
        style={{
          background: "rgba(20, 241, 149, 0.14)",
          color: "#0a8f57",
          border: "1px solid rgba(20, 241, 149, 0.35)",
        }}
      >
        <CheckIcon />
        Valid
      </div>
    );
  }

  if (wrongShape) {
    return (
      <div
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10.5px] font-bold animate-fade-in"
        style={{
          background: "rgba(255, 71, 87, 0.10)",
          color: "#c1374a",
          border: "1px solid rgba(255, 71, 87, 0.30)",
        }}
      >
        <XIcon />
        Not a Solana address
      </div>
    );
  }

  if (tooShort && focused) {
    return (
      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10.5px] font-medium text-text-muted">
        <span className="size-1.5 rounded-full bg-text-muted/50 animate-pulse" />
        Keep typing…
      </div>
    );
  }

  return null;
}

function CheckIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}
