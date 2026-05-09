import Link from "next/link";
import { TopNav } from "@/components/shared/TopNav";

export default function NotFound() {
  return (
    <>
      <TopNav />
      <main className="flex-1 flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <h1 className="text-[40px] font-semibold leading-tight">No pulse</h1>
          <p className="text-text-secondary mt-3 text-[14px]">
            That doesn&apos;t look like a Solana token contract address. Paste a
            valid mint address starting from the home page.
          </p>
          <Link
            href="/"
            className="inline-block mt-6 px-5 h-11 leading-[44px] rounded-full bg-white text-black font-medium text-[13px] hover:bg-white/90 transition"
          >
            Back home
          </Link>
        </div>
      </main>
    </>
  );
}
