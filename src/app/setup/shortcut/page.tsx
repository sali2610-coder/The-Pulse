import { ShortcutVisual } from "@/components/setup/shortcut-visual";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

export const metadata = {
  title: "ויזואל Shortcut · Sally · מסלול מתקדם",
  description: "מדריך ויזואלי להגדרת iOS Shortcut (מסלול SMS fallback)",
};

export default function ShortcutVisualPage() {
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
        <div className="rounded-2xl border border-white/8 bg-surface/40 px-3 py-2 text-[11px] text-muted-foreground">
          <strong className="text-foreground/90">מסלול מתקדם · SMS fallback.</strong>{" "}
          ל־iOS 18+ מומלץ דווקא במסלול ה־
          <Link
            href="/setup/wallet"
            className="text-[color:var(--neon)] underline-offset-2 hover:underline"
          >
            Wallet
          </Link>
          .
        </div>
        <ShortcutVisual />
      </div>
    </main>
  );
}
