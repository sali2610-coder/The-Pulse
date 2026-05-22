"use client";

import { useEffect, useState } from "react";
import { User } from "lucide-react";
import { motion } from "framer-motion";

import { getCurrentSession, onAuthStateChange } from "@/lib/supabase/auth";

// Minimal "you're signed in" indicator for the dashboard header.
// Reads the live Supabase session — updates immediately when the
// user signs out from the settings card.

type SessionShape = {
  email: string | null;
  /** Supabase doesn't surface a name / image without user_metadata.
   *  We display the email as fallback. */
  name?: string;
  image?: string;
} | null;

export function HeaderUser() {
  const [session, setSession] = useState<SessionShape>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await getCurrentSession();
        if (!cancelled) {
          setSession(s ? { email: s.email } : null);
        }
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    const unsub = onAuthStateChange((s) => {
      setSession(s ? { email: s.email } : null);
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  if (!loaded || !session?.email) return null;

  const initials = session.email
    .split(/[\s@]+/)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: 0.1, duration: 0.35 }}
      title={session.email}
      className="flex shrink-0 items-center gap-2 rounded-full border border-white/10 bg-surface/60 px-2 py-1.5 backdrop-blur-md"
    >
      <span className="flex size-7 items-center justify-center rounded-full bg-[#34D399]/15 text-[11px] font-medium text-[#34D399]">
        {initials || <User className="size-3.5" />}
      </span>
      <span className="hidden text-[11px] text-muted-foreground sm:block">
        מחובר
      </span>
    </motion.div>
  );
}
