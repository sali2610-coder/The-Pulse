"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  CheckCircle2,
  ChevronLeft,
  MessageSquareText,
  Sparkles,
  Wallet,
} from "lucide-react";

import { SetupGuide } from "./setup-guide";
import { WalletSetupGuide } from "./wallet-setup-guide";
import { tap } from "@/lib/haptics";

type Preferred = "wallet" | "sms" | null;
const STORAGE_KEY = "sally.setup.preferred";

/**
 * Top-level entry to the Setup tab. Lets the user pick between the
 * recommended Wallet-first flow and the legacy SMS fallback, then routes to
 * the matching guide. Remembers the choice in localStorage so returning users
 * land back on the same flow.
 */
export function SetupHub() {
  const [preferred, setPreferred] = useState<Preferred>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    // Defer the read to a microtask so the compiler's "no sync setState in
    // effect" rule is satisfied. localStorage isn't reactive — one-shot read
    // on mount is fine.
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored === "wallet" || stored === "sms") {
          setPreferred(stored);
        }
      } catch {
        /* localStorage blocked — show the hub instead */
      }
      setHydrated(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!hydrated) return null;

  function choose(value: Preferred) {
    tap();
    setPreferred(value);
    try {
      if (value) localStorage.setItem(STORAGE_KEY, value);
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }

  if (preferred === "wallet") {
    return <WalletSetupGuide onBack={() => choose(null)} />;
  }
  if (preferred === "sms") {
    return <SetupGuide onBack={() => choose(null)} />;
  }

  return (
    <div className="space-y-4">
      <motion.section
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-3xl border border-white/10 bg-gradient-to-b from-white/[0.04] to-transparent p-5 backdrop-blur-md"
      >
        <div className="text-[11px] uppercase tracking-[0.3em] text-gold/80">
          Choose your path
        </div>
        <h1 className="mt-2 text-2xl font-light leading-tight tracking-tight text-foreground">
          איך אתה רוצה לחבר את החיובים?
        </h1>
        <p className="mt-2 text-[12px] text-muted-foreground">
          שתי דרכים. Wallet הוא המסלול המומלץ עבור iOS 18+ — שולח כל חיוב Apple
          Pay מיד ל־PendingTray. SMS הוא מסלול fallback למקרים בהם Wallet לא
          זמין.
        </p>
      </motion.section>

      <PathCard
        onClick={() => choose("wallet")}
        recommended
        accent="#00E5FF"
        icon={<Wallet className="size-6" strokeWidth={1.7} />}
        title="Apple Wallet"
        tagline="iOS 18+ · החיוב נכנס מהרגע שאתה משלם"
        features={[
          "אישור במגע אחד מ־PendingTray",
          "תומך גם כש־SMS לא מגיע",
          "Deep-link מהתראה ל־ConfirmationSheet",
        ]}
      />

      <PathCard
        onClick={() => choose("sms")}
        accent="#A1A1AA"
        icon={<MessageSquareText className="size-6" strokeWidth={1.7} />}
        title="SMS (CAL / MAX)"
        tagline="מסלול מתקדם · fallback"
        features={[
          "מומלץ רק כש־Wallet לא זמין",
          "תלוי בפורמט ה־SMS של הבנק",
          "דורש Shortcut לכל מנפיק בנפרד",
        ]}
      />

      <p className="px-1 text-center text-[11px] text-muted-foreground">
        אפשר לעבור בין המסלולים בכל זמן.
      </p>
    </div>
  );
}

function PathCard({
  onClick,
  recommended,
  accent,
  icon,
  title,
  tagline,
  features,
}: {
  onClick: () => void;
  recommended?: boolean;
  accent: string;
  icon: React.ReactNode;
  title: string;
  tagline: string;
  features: string[];
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.985 }}
      transition={{ type: "spring", stiffness: 320, damping: 24 }}
      className="group relative w-full overflow-hidden rounded-3xl border bg-gradient-to-b from-white/[0.04] to-white/[0.01] p-5 text-start backdrop-blur-2xl transition-colors"
      style={{
        borderColor: recommended ? `${accent}40` : "rgba(255,255,255,0.08)",
        boxShadow: recommended
          ? `inset 0 1px 0 rgba(255,255,255,0.06), 0 18px 40px -28px ${accent}88`
          : "inset 0 1px 0 rgba(255,255,255,0.05)",
      }}
    >
      {/* Bloom */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-16 -end-12 size-40 rounded-full opacity-30 blur-3xl"
        style={{ background: accent }}
      />

      <div className="relative flex items-start gap-4">
        <span
          className="flex size-12 shrink-0 items-center justify-center rounded-2xl"
          style={{
            background: `${accent}1f`,
            color: accent,
            boxShadow: `inset 0 0 0 1px ${accent}33`,
          }}
        >
          {icon}
        </span>

        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold text-foreground">{title}</h3>
            {recommended && (
              <span
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider"
                style={{
                  background: `${accent}22`,
                  color: accent,
                  border: `1px solid ${accent}55`,
                }}
              >
                <Sparkles className="size-2.5" />
                מומלץ
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">{tagline}</p>
          <ul className="space-y-1 pt-1">
            {features.map((f) => (
              <li
                key={f}
                className="flex items-start gap-2 text-[12px] text-foreground/80"
              >
                <CheckCircle2
                  className="mt-0.5 size-3.5 shrink-0"
                  style={{ color: accent }}
                  strokeWidth={1.8}
                />
                <span>{f}</span>
              </li>
            ))}
          </ul>
        </div>

        <ChevronLeft
          className="self-center text-muted-foreground transition-transform group-hover:-translate-x-1"
          strokeWidth={1.6}
        />
      </div>

      <span className="sr-only">בחר במסלול {title}</span>
    </motion.button>
  );
}
