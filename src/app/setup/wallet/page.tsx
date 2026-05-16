import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { WalletSetupGuide } from "@/components/setup/wallet-setup-guide";

export const metadata = {
  title: "Apple Wallet Setup · Sally",
  description: "חיבור Apple Wallet אל Pulse",
};

export default function WalletSetupPage() {
  return (
    <main className="relative flex flex-1 flex-col items-stretch px-5 pb-12 pt-8 sm:items-center">
      <div className="mx-auto flex w-full max-w-md flex-col gap-5">
        <Link
          href="/"
          className="inline-flex items-center gap-2 self-start rounded-full border border-border/60 bg-background/40 px-3 py-1.5 text-[11px] text-muted-foreground transition-colors hover:border-neon/50 hover:text-foreground"
        >
          <ArrowRight className="size-3 rotate-180" />
          חזרה לדאשבורד
        </Link>
        <WalletSetupGuide />
      </div>
    </main>
  );
}
