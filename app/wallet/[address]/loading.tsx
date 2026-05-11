import { TopNav } from "@/components/shared/TopNav";

/**
 * Loading skeleton for /wallet/[address]. Mirrors the cell layout so the
 * page doesn't reflow when the data arrives. Shows a "Reading wallet…"
 * line and shimmer placeholders for each cell.
 */
export default function Loading() {
  return (
    <div
      className="flex flex-col min-h-screen"
      style={{ background: "var(--bg-primary)", color: "var(--text-primary)" }}
    >
      <TopNav />
      <main className="flex-1 mx-auto max-w-[1320px] w-full px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
        <div className="h-3 w-24 rounded bg-text-muted/15 animate-shimmer mb-5" />

        {/* Hero placeholder */}
        <div
          className="rounded-2xl p-5 sm:p-6 mb-5 animate-shimmer h-[200px]"
          style={{
            background: "var(--glass-medium)",
            border: "1px solid var(--border-subtle)",
          }}
        />

        {/* Two cells */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.4fr] gap-4 lg:gap-5 mb-5">
          <div
            className="rounded-2xl p-5 sm:p-6 h-[300px] animate-shimmer"
            style={{
              background: "var(--glass-medium)",
              border: "1px solid var(--border-subtle)",
            }}
          />
          <div
            className="rounded-2xl p-5 sm:p-6 h-[300px] animate-shimmer"
            style={{
              background: "var(--glass-medium)",
              border: "1px solid var(--border-subtle)",
            }}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-4 lg:gap-5">
          <div
            className="rounded-2xl p-5 sm:p-6 h-[420px] animate-shimmer"
            style={{
              background: "var(--glass-medium)",
              border: "1px solid var(--border-subtle)",
            }}
          />
          <div
            className="rounded-2xl p-5 sm:p-6 h-[420px] animate-shimmer"
            style={{
              background: "var(--glass-medium)",
              border: "1px solid var(--border-subtle)",
            }}
          />
        </div>

        <div className="mt-6 text-center text-[11px] text-text-muted">
          Reading wallet…
        </div>
      </main>
    </div>
  );
}
