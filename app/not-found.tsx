import Link from "next/link";
import { TopNav } from "@/components/shared/TopNav";

export default function NotFound() {
  return (
    <>
      <TopNav />
      <main className="flex-1 flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <h1 className="text-[40px] font-semibold leading-tight">404</h1>
          <p className="text-text-secondary mt-2">No pulse here.</p>
          <Link
            href="/"
            className="inline-block mt-5 px-5 h-10 leading-[40px] rounded-full bg-white text-black font-medium text-[13px] hover:bg-white/90 transition"
          >
            Back home
          </Link>
        </div>
      </main>
    </>
  );
}
