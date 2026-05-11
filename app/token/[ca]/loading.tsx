import { TopNav } from "@/components/shared/TopNav";
import { PulseGlyph } from "@/components/shared/Logo";

/**
 * Loading screen for /token/[ca]. Lands in the ~3-10s window between
 * "user clicked the token link" and "AI synthesis finishes streaming."
 *
 * Earlier version was four grey shimmer rectangles. With the AI cell
 * being Suspense'd, that empty stretch on first-load was the longest
 * blank moment in the app. This version replaces it with a branded
 * pulse mark + status copy that signals progress, plus skeleton blocks
 * that match the final layout dimensions so nothing reflows on resolve.
 */
export default function Loading() {
  return (
    <>
      <TopNav />
      <main className="flex-1 mx-auto max-w-7xl w-full px-4 sm:px-6 lg:px-8 pb-24 pt-6">
        {/* Branded pulse banner — uses the same glow we use on the hero
            so the loading state feels like an extension of the brand
            rather than a generic spinner. */}
        <div
          className="rounded-2xl p-5 sm:p-6 mb-6 relative overflow-hidden flex items-center gap-4"
          style={{
            background:
              "linear-gradient(135deg, var(--glass-strong), var(--glass-medium))",
            border: "1px solid var(--border-subtle)",
            boxShadow:
              "0 1px 0 rgba(255,255,255,0.08) inset, 0 10px 32px rgba(10, 10, 30, 0.06)",
          }}
        >
          {/* Soft brand glow drifting behind the mark */}
          <div
            aria-hidden
            className="absolute -top-12 -right-12 size-52 pointer-events-none"
            style={{
              background:
                "radial-gradient(circle, rgba(255, 45, 156, 0.30) 0%, rgba(94, 92, 255, 0.10) 40%, transparent 70%)",
              filter: "blur(20px)",
              animation: "heartbeat-dot 1.8s ease-in-out infinite",
            }}
          />
          <div
            className="relative shrink-0"
            style={{ animation: "heartbeat-dot 1.4s ease-in-out infinite" }}
          >
            <PulseGlyph size={44} />
          </div>
          <div className="relative flex-1 min-w-0">
            <div className="text-[10.5px] uppercase tracking-[0.22em] text-text-muted font-bold">
              Reading the pulse
            </div>
            <div className="text-[15px] sm:text-[17px] font-bold tracking-tight text-text-primary mt-1">
              Pulling on-chain data, sentiment, and live catalysts.
            </div>
            <div className="text-[11.5px] text-text-secondary mt-1">
              Synthesis arrives in a few seconds. AI panels stream in last.
            </div>
          </div>
        </div>

        {/* Header skeleton: avatar + token name + ticker line */}
        <div className="flex items-start gap-4 mb-7">
          <div
            className="size-20 rounded-2xl animate-shimmer"
            style={{ background: "var(--glass-soft)" }}
          />
          <div className="flex-1 space-y-2 max-w-sm">
            <div
              className="h-8 rounded animate-shimmer w-3/4"
              style={{ background: "var(--glass-soft)" }}
            />
            <div
              className="h-4 rounded animate-shimmer w-1/2"
              style={{ background: "var(--glass-soft)" }}
            />
          </div>
        </div>

        {/* Cell skeletons matching the live layout so nothing reflows */}
        <div className="grid grid-cols-1 lg:grid-cols-[1.05fr_1fr] gap-5 lg:gap-7">
          <div className="space-y-5">
            <CellSkeleton height={180} label="Price · live" />
            <CellSkeleton height={300} label="Buy / sell pressure" />
            <CellSkeleton height={420} label="Candlestick" />
          </div>
          <div className="space-y-5">
            <CellSkeleton height={260} label="AI synthesis" pulse />
            <CellSkeleton height={160} label="Risk · 0..100" />
            <CellSkeleton height={220} label="Holders" />
            <CellSkeleton height={180} label="Catalysts" />
          </div>
        </div>
      </main>
    </>
  );
}

/**
 * Single cell placeholder. Renders a labelled glass card so the user
 * knows what's loading where, with a soft pulsing shimmer matching the
 * brand pink. The `pulse` variant adds a slow pink glow under the
 * heading — used for the AI Synthesis cell since it's the slowest and
 * most-anticipated piece of the page.
 */
function CellSkeleton({
  height,
  label,
  pulse,
}: {
  height: number;
  label: string;
  pulse?: boolean;
}) {
  return (
    <div
      className="rounded-2xl p-5 sm:p-6 relative overflow-hidden animate-shimmer"
      style={{
        background: "var(--glass-medium)",
        border: "1px solid var(--border-subtle)",
        height,
        boxShadow:
          "0 1px 0 rgba(255,255,255,0.08) inset, 0 6px 20px rgba(10, 10, 30, 0.04)",
      }}
    >
      {pulse && (
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse 60% 40% at 50% 10%, rgba(255, 45, 156, 0.10), transparent 70%)",
            animation: "heartbeat-dot 2.4s ease-in-out infinite",
          }}
        />
      )}
      <div className="relative text-[10px] uppercase tracking-[0.2em] text-text-muted font-bold">
        {label}
      </div>
    </div>
  );
}
