"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, Copy, Eye, EyeOff, Key, RotateCcw, Trash2 } from "lucide-react";
import { useFinanceStore } from "@/lib/store";
import { AUTH_ENABLED } from "@/lib/auth-config";
import { Button } from "@/components/ui/button";
import { tap } from "@/lib/haptics";
import { toast } from "sonner";

type State =
  | { kind: "loading" }
  | { kind: "none" }
  | { kind: "loaded"; token: string };

export function ApiTokenCard() {
  // Hooks must be called unconditionally — gate the render path below.
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const [state, setState] = useState<State>({ kind: "loading" });
  const [reveal, setReveal] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!AUTH_ENABLED) return;
    if (!hydrated) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/token", {
          credentials: "same-origin",
        });
        if (!res.ok) {
          if (!cancelled) setState({ kind: "none" });
          return;
        }
        const data = (await res.json()) as { token: string | null };
        if (cancelled) return;
        setState(data.token ? { kind: "loaded", token: data.token } : { kind: "none" });
      } catch {
        if (!cancelled) setState({ kind: "none" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hydrated]);

  // Multi-user-only feature — render nothing in single-user mode.
  if (!AUTH_ENABLED) return null;

  const generate = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/auth/token", {
        method: "POST",
        credentials: "same-origin",
      });
      if (!res.ok) {
        toast.error("יצירת טוקן נכשלה");
        return;
      }
      const data = (await res.json()) as { token: string };
      setState({ kind: "loaded", token: data.token });
      setReveal(true);
      tap();
      toast.success("טוקן חדש נוצר — העתק עכשיו");
    } finally {
      setBusy(false);
    }
  };

  const revoke = async () => {
    if (busy) return;
    if (!confirm("ביטול הטוקן ינתק את ה־Shortcut. להמשיך?")) return;
    setBusy(true);
    try {
      const res = await fetch("/api/auth/token", {
        method: "DELETE",
        credentials: "same-origin",
      });
      if (!res.ok) {
        toast.error("ביטול נכשל");
        return;
      }
      setState({ kind: "none" });
      setReveal(false);
      tap();
      toast.success("הטוקן בוטל");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-2xl border border-border/60 bg-surface/50 p-5 backdrop-blur-md">
      <header className="mb-4 flex items-center gap-2">
        <Key className="size-4 text-neon" />
        <div>
          <div className="text-sm font-medium text-foreground">
            Personal API Token
          </div>
          <div className="text-[11px] text-muted-foreground">
            הטוקן האישי שמופיע ב־Authorization header של ה־Shortcut. החלף את ה־
            <code className="font-mono">WEBHOOK_SECRET</code> הישן בערך הזה.
          </div>
        </div>
      </header>

      {state.kind === "loading" ? (
        <div className="text-[11px] text-muted-foreground">טוען…</div>
      ) : state.kind === "none" ? (
        <div className="space-y-3">
          <p className="text-[11px] text-muted-foreground">
            עוד לא יצרת טוקן. צור עכשיו והעתק ל־Shortcut.
          </p>
          <Button
            type="button"
            onClick={generate}
            disabled={busy}
            className="h-9 bg-neon text-[#050505] hover:bg-neon/90"
          >
            צור טוקן
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="rounded-xl border border-border/40 bg-background/40 px-3 py-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                Bearer Token
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setReveal((v) => !v)}
                  className="flex h-7 items-center gap-1 rounded-md px-2 text-[11px] text-muted-foreground hover:bg-surface hover:text-foreground"
                  aria-label={reveal ? "הסתר" : "הצג"}
                >
                  {reveal ? (
                    <EyeOff className="size-3" />
                  ) : (
                    <Eye className="size-3" />
                  )}
                </button>
                <CopyChip value={state.token} />
              </div>
            </div>
            <div
              data-mono="true"
              className="mt-1 break-all text-[11px] text-foreground"
              style={{ direction: "ltr", textAlign: "left" }}
            >
              {reveal
                ? state.token
                : `${state.token.slice(0, 8)}…${state.token.slice(-4)}`}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={revoke}
              disabled={busy}
              className="flex h-9 items-center gap-1.5 rounded-lg border border-destructive/40 bg-destructive/10 px-3 text-xs text-destructive hover:bg-destructive/20 disabled:opacity-40"
            >
              <Trash2 className="size-3.5" />
              בטל
            </button>
            <button
              type="button"
              onClick={generate}
              disabled={busy}
              className="flex h-9 items-center gap-1.5 rounded-lg border border-border/60 bg-background/40 px-3 text-xs text-muted-foreground hover:border-neon/50 hover:text-foreground disabled:opacity-40"
            >
              <RotateCcw className="size-3.5" />
              רענן
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function CopyChip({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      tap();
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked */
    }
  };
  return (
    <button
      type="button"
      onClick={onCopy}
      className="flex h-7 items-center gap-1 rounded-md px-2 text-[11px] text-muted-foreground hover:bg-surface hover:text-foreground"
    >
      <AnimatePresence mode="wait" initial={false}>
        {copied ? (
          <motion.span
            key="ok"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="flex items-center gap-1 text-gold"
          >
            <Check className="size-3" /> הועתק
          </motion.span>
        ) : (
          <motion.span
            key="copy"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex items-center gap-1"
          >
            <Copy className="size-3" /> העתק
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  );
}
