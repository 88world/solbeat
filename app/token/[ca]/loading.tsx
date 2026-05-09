import { TopNav } from "@/components/shared/TopNav";

export default function Loading() {
  return (
    <>
      <TopNav />
      <main className="flex-1 mx-auto max-w-7xl w-full px-4 sm:px-6 lg:px-8 pb-24">
        <div className="text-[12px] text-text-muted mb-6">Reading the pulse…</div>

        <div className="flex items-start gap-4 mb-8">
          <div className="size-20 rounded-2xl glass animate-shimmer" />
          <div className="flex-1 space-y-2 max-w-sm">
            <div className="h-9 rounded glass animate-shimmer w-3/4" />
            <div className="h-4 rounded glass animate-shimmer w-1/2" />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1.05fr_1fr] gap-5 lg:gap-7">
          <div className="space-y-5">
            <div className="glass rounded-2xl h-[180px] animate-shimmer" />
            <div className="glass rounded-2xl h-[420px] animate-shimmer" />
          </div>
          <div className="space-y-5">
            <div className="glass rounded-2xl h-[260px] animate-shimmer" />
            <div className="glass rounded-2xl h-[140px] animate-shimmer" />
            <div className="glass rounded-2xl h-[200px] animate-shimmer" />
          </div>
        </div>
      </main>
    </>
  );
}
