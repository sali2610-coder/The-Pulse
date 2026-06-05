"use client";

// Phase 384 — one-time discovery hint.
//
// Shown ONCE per device/user the first time the Home tab mounts.
// Persists the "seen" flag in localStorage so it never appears
// again. Fades out after ~3 seconds; users can tap it to dismiss
// immediately.

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Sparkles } from "lucide-react";

const STORAGE_KEY = "sally.home.tap-discovery.v1";

function alreadyShown(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return true;
  }
}

function markShown(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, "1");
  } catch {
    /* noop */
  }
}

export function TapDiscoveryToast() {
  // Phase 384 — lazy initializer reads "already shown" exactly once
  // on first render, then auto-dismisses via a timer effect. Avoids
  // the set-state-in-effect anti-pattern.
  const [show, setShow] = useState(() => {
    if (alreadyShown()) return false;
    markShown();
    return true;
  });
  useEffect(() => {
    if (!show) return;
    const t = setTimeout(() => setShow(false), 3200);
    return () => clearTimeout(t);
  }, [show]);

  return (
    <AnimatePresence>
      {show ? (
        <motion.button
          type="button"
          onClick={() => setShow(false)}
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.24 }}
          dir="rtl"
          className="pointer-events-auto fixed left-1/2 top-[max(env(safe-area-inset-top),12px)] z-40 inline-flex -translate-x-1/2 items-center gap-2 rounded-full border border-gold/30 bg-black/60 px-3 py-1.5 text-[12px] text-foreground/90 backdrop-blur-md"
          style={{
            boxShadow: "0 8px 28px -10px rgba(212,175,55,0.45)",
          }}
          aria-label="אפשר ללחוץ על הכרטיסים לפירוט"
        >
          <Sparkles className="size-3 text-gold" aria-hidden />
          אפשר ללחוץ על הכרטיסים לפירוט
        </motion.button>
      ) : null}
    </AnimatePresence>
  );
}
