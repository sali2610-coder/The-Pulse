"use client";

import { useEffect, useState } from "react";
import { User } from "lucide-react";
import { motion } from "framer-motion";

// Minimal "you're signed in" indicator for the dashboard header. Shows
// the Google avatar (or a fallback chip) when a session exists, and a
// blank slot otherwise. Sign-out / switch-account actions live in the
// AuthCard inside the Settings tab — the header is intentionally just a
// visual confirmation so it doesn't crowd the screen.

type Session = {
  user?: {
    email?: string;
    name?: string;
    image?: string;
  };
} | null;

export function HeaderUser() {
  const [session, setSession] = useState<Session>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/session", { cache: "no-store" });
        const json = (await res.json().catch(() => null)) as Session;
        if (!cancelled) setSession(json);
      } catch {
        /* offline — header just stays empty */
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!loaded || !session?.user?.email) return null;

  const initials = (session.user.name ?? session.user.email)
    .split(/\s+/)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: 0.1, duration: 0.35 }}
      title={session.user.email}
      className="flex shrink-0 items-center gap-2 rounded-full border border-white/10 bg-surface/60 px-2 py-1.5 backdrop-blur-md"
    >
      {session.user.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={session.user.image}
          alt=""
          className="size-7 rounded-full border border-white/10"
        />
      ) : (
        <span className="flex size-7 items-center justify-center rounded-full bg-[#34D399]/15 text-[11px] font-medium text-[#34D399]">
          {initials || <User className="size-3.5" />}
        </span>
      )}
      <span className="hidden text-[11px] text-muted-foreground sm:block">
        מחובר
      </span>
    </motion.div>
  );
}
