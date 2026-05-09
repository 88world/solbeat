import { TopNav } from "@/components/shared/TopNav";
import { WalletPulseClient } from "@/components/wallet/WalletPulseClient";

export const dynamic = "force-dynamic";

export default function WalletPulsePage() {
  return (
    <>
      <TopNav />
      <main className="flex-1 px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
        <WalletPulseClient />
      </main>
    </>
  );
}
