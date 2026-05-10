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

type Props = {
  onPulse?: (kind: "valid" | "invalid") => void;
  /** Optional 0..1, when hot, the paste box glow tilts pink. */
  heat?: number;
};

const PLACEHOLDERS = [
  "Paste a Solana contract address…",
  "Paste a CA, try $BONK, $WIF, $JUP",
  "Drop any mint. Read its pulse.",
  "Paste an address. Decode the token.",
] as const;

export function CaPasteBox({ onPulse, heat = 0 }: Props) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [focused, setFocused] = useState(false);
  const [justPasted, setJustPasted] = useState(false);
  const [ripples, setRipples] = useState<Ripple[]>([]);
  const [magnet, setMagnet] = useState({ x: 0, y: 0 });
  const [phIdx, setPhIdx] = useState(0);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const trimmed = value.trim();
  const valid = isValidSolanaAddress(trimmed);
  const tooShort = trimmed.length > 0 && trimmed.length < 32;
  const wrongShape =
    trimmed.length >= 32 && !valid && !/^\$?[A-Za-z]{2,10}$/.test(trimmed);

  // ⌘V / Ctrl+V anywhere → focus
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

  // Cycle the placeholder while empty + unfocused, slowed to reduce visual noise
  useEffect(() => {
    if (focused || value.length > 0) return;
    const id = setInterval(() => {
      setPhIdx((i) => (i + 1) % PLACEHOLDERS.length);
    }, 5500);
    return () => clearInterval(id);
  }, [focused, value.length]);

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

  const onButtonMove = (e: ReactMouseEvent<HTMLButtonElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const dx = (e.clientX - (r.left + r.width / 2)) * 0.20;
    const dy = (e.clientY - (r.top + r.height / 2)) * 0.24;
    setMagnet({ x: dx, y: dy });
  };
  const onButtonLeave = () => setMagnet({ x: 0, y: 0 });

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

  // Heat-tinted ambient glow color
  const heatClamped = Math.max(0, Math.min(1, heat));
  const ambientGlow =
    heatClamped >= 0.5
      ? `rgba(255, 45, 156, ${0.10 + heatClamped * 0.10})`
      : `rgba(94, 92, 255, ${0.08 + (1 - heatClamped) * 0.06})`;

  return (
    <form
      onSubmit={submit}
      className="relative w-full max-w-lg mx-auto"
      autoComplete="off"
      role="search"
    >
      {/* Ambient bloom that follows market heat, sits behind the box */}
      <div
        aria-hidden
        className="absolute -inset-6 rounded-[2.5rem] pointer-events-none transition-colors duration-1000"
        style={{
          background: `radial-gradient(ellipse 60% 80% at 50% 50%, ${ambientGlow}, transparent 70%)`,
          filter: "blur(40px)",
        }}
      />

      <div className="relative">
        {/* Animated gradient ring on focus */}
        <div
          aria-hidden
          className={`pointer-events-none absolute -inset-px rounded-[1.75rem] transition-opacity duration-500 ${
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
          className={`relative flex items-center w-full p-1.5 rounded-2xl transition-all duration-500 ${
            error
              ? "shadow-[0_8px_24px_rgba(255,71,87,0.18)]"
              : justPasted
                ? "shadow-[0_14px_36px_rgba(20,241,149,0.22)]"
                : focused
                  ? "shadow-[0_14px_36px_rgba(255,45,156,0.16)]"
                  : "shadow-[0_10px_28px_rgba(10,10,30,0.06),0_0_0_1px_rgba(10,10,30,0.05)]"
          }`}
          style={{
            background: "rgba(255, 255, 255, 0.92)",
            backdropFilter: "blur(20px) saturate(170%)",
            WebkitBackdropFilter: "blur(20px) saturate(170%)",
            border: error
              ? "1px solid rgba(255, 71, 87, 0.4)"
              : focused
                ? "1px solid transparent"
                : "1px solid rgba(10, 10, 30, 0.05)",
          }}
        >
          <div className="pl-3.5 pr-2.5 text-text-muted">
            <SearchIcon focused={focused} />
          </div>

          <div className="relative flex-1 min-w-0">
            <input
              ref={inputRef}
              type="text"
              inputMode="text"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              placeholder=""
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
              className="w-full bg-transparent text-text-primary text-[14px] text-mono outline-none py-2.5 min-w-0"
              aria-label="Solana token address"
            />
            {/* Cycling placeholder, fades between phrases */}
            {value.length === 0 && !focused && (
              <div
                key={phIdx}
                aria-hidden
                className="absolute inset-y-0 left-0 flex items-center pointer-events-none animate-fade-in text-text-muted/85 text-[14px] text-mono"
              >
                {PLACEHOLDERS[phIdx]}
              </div>
            )}
          </div>

          {/* Validation slot */}
          <div className="flex items-center gap-2 mr-2 shrink-0">
            <ValidationBadge
              valid={valid}
              tooShort={tooShort}
              wrongShape={wrongShape}
              empty={trimmed.length === 0}
              focused={focused}
            />
          </div>

          {/* ⌘V hint when empty */}
          {!focused && value.length === 0 && (
            <div className="hidden md:flex items-center gap-1 mr-2 pointer-events-none">
              <kbd
                className="text-[9.5px] text-text-muted text-mono px-1.5 py-0.5 rounded"
                style={{
                  background: "rgba(10, 10, 30, 0.04)",
                  border: "1px solid rgba(10, 10, 30, 0.06)",
                }}
              >
                ⌘V
              </kbd>
            </div>
          )}

          {/* CTA */}
          <button
            ref={buttonRef}
            type="submit"
            disabled={pending || !canSubmit}
            onMouseMove={onButtonMove}
            onMouseLeave={onButtonLeave}
            onMouseDown={spawnRipple}
            className={`relative overflow-hidden px-4 sm:px-5 h-[40px] sm:h-[44px] rounded-lg font-bold text-[12.5px] tracking-tight transition-all ${
              canSubmit
                ? "text-white hover:scale-[1.04] active:scale-[0.97] shadow-[0_5px_16px_rgba(10,10,30,0.20)]"
                : "bg-text-muted/12 text-text-muted cursor-not-allowed"
            } disabled:opacity-60`}
            style={{
              transform: canSubmit
                ? `translate(${magnet.x}px, ${magnet.y}px)`
                : undefined,
              transition:
                "transform 200ms cubic-bezier(0.22,1,0.36,1), box-shadow 300ms",
              background: canSubmit
                ? `linear-gradient(110deg, #0a0a14 0%, #1a1a2e 45%, ${
                    valid ? "#FF2D9C" : "#1a1a2e"
                  } 100%)`
                : undefined,
            }}
          >
            {canSubmit && (
              <span
                aria-hidden
                className="absolute inset-0 pointer-events-none opacity-0 hover:opacity-100"
                style={{
                  background: `radial-gradient(140px circle at ${
                    50 + magnet.x * 6
                  }% ${50 + magnet.y * 6}%, rgba(255,45,156,0.50), transparent 65%)`,
                }}
              />
            )}

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
                  background: "var(--glass-medium)",
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
                  <span aria-hidden>→</span>
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
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={focused ? 2.6 : 2.2}
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
