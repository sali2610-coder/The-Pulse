"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CloudDownload,
  CloudUpload,
  Download,
  History,
  Lock,
  RefreshCcw,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

import { useFinanceStore } from "@/lib/store";
import { tap, success } from "@/lib/haptics";
import {
  buildEnvelope,
  downloadEnvelope,
  parseEnvelope,
} from "@/lib/backup-export";
import {
  decryptEnvelope,
  encryptPayload,
  isEncryptedEnvelope,
} from "@/lib/backup-crypto";
import { recommendBackup } from "@/lib/backup-recommender";

type Summary = {
  entries: number;
  accounts: number;
  loans: number;
  rules: number;
  incomes: number;
  statuses: number;
  monthlyBudget: number;
  richness: number;
  updatedAt?: number;
};

type Backup = {
  capturedAt: number;
  reason:
    | "manual"
    | "pre-restore"
    | "pre-claim-device"
    | "pre-recover-device"
    | "auto";
} & Summary;

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

const TIME_FMT = new Intl.DateTimeFormat("he-IL", {
  dateStyle: "medium",
  timeStyle: "short",
});

const REASON_LABEL: Record<Backup["reason"], string> = {
  manual: "ידני",
  "pre-restore": "לפני שחזור",
  "pre-claim-device": "לפני קישור מכשיר",
  "pre-recover-device": "לפני שחזור מכשיר",
  auto: "אוטומטי",
};

const REASON_TONE: Record<Backup["reason"], string> = {
  manual: "#00E5FF",
  "pre-restore": "#D4AF37",
  "pre-claim-device": "#A78BFA",
  "pre-recover-device": "#A78BFA",
  auto: "#A1A1AA",
};

function fmtTime(ts: number | null | undefined): string {
  if (typeof ts !== "number" || ts <= 0) return "—";
  try {
    return TIME_FMT.format(new Date(ts));
  } catch {
    return "—";
  }
}

export function BackupsCard() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const [busy, setBusy] = useState(false);
  const [authStatus, setAuthStatus] = useState<
    "loading" | "no-session" | "ready" | "kv-unavailable"
  >("loading");
  const [current, setCurrent] = useState<Summary | null>(null);
  const [backups, setBackups] = useState<Backup[]>([]);
  const [open, setOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/backups", {
        method: "GET",
        cache: "no-store",
        credentials: "same-origin",
      });
      if (res.status === 401) {
        setAuthStatus("no-session");
        return;
      }
      const data = (await res.json()) as {
        ok?: boolean;
        configured?: boolean;
        current?: Summary | null;
        backups?: Backup[];
      };
      if (data.configured === false) {
        setAuthStatus("kv-unavailable");
        return;
      }
      setAuthStatus("ready");
      setCurrent(data.current ?? null);
      setBackups(data.backups ?? []);
    } catch {
      setAuthStatus("no-session");
    }
  }, []);

  // Initial fetch on mount. Defer one tick via Promise.resolve so
  // the lint rule doesn't see a setState call originating directly
  // from the effect body — the rule fires on `void refresh()` even
  // though refresh awaits a network round-trip first.
  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(() => {
      if (!cancelled) void refresh();
    });
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  const recommended = recommendBackup(
    backups.map((b) => ({
      capturedAt: b.capturedAt,
      reason: b.reason,
      richness: b.richness,
    })),
  );

  async function manualBackup() {
    if (busy) return;
    setBusy(true);
    tap();
    try {
      const res = await fetch("/api/backups", {
        method: "POST",
        credentials: "same-origin",
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        capturedAt?: number;
        summary?: Summary;
      };
      if (res.ok && data.ok) {
        success();
        toast.success("גיבוי ידני נשמר", {
          description: data.summary
            ? `${data.summary.entries} חיובים, ${data.summary.accounts + data.summary.loans + data.summary.incomes} ישויות`
            : undefined,
        });
        await refresh();
      } else if (data.error === "empty_state_not_backed_up") {
        toast.error("אין מה לגבות עדיין");
      } else if (data.error === "no_live_state") {
        toast.error("אין נתונים פעילים בענן עוד");
      } else {
        toast.error(data.error ?? "הגיבוי נכשל");
      }
    } finally {
      setBusy(false);
    }
  }

  async function restore(b: Backup, confirmEmpty = false) {
    if (busy) return;
    if (
      typeof window !== "undefined" &&
      !window.confirm(
        `לשחזר גיבוי מ־${fmtTime(b.capturedAt)}? המצב הנוכחי יישמר כ־pre-restore.`,
      )
    ) {
      return;
    }
    setBusy(true);
    tap();
    try {
      const res = await fetch("/api/backups/restore", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          capturedAt: b.capturedAt,
          confirmEmpty,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        liveSummary?: Summary;
        targetSummary?: Summary;
      };
      if (res.status === 409 && data.error === "empty_backup_blocked") {
        if (
          typeof window !== "undefined" &&
          window.confirm(
            "הגיבוי הזה ריק. ההחלפה תמחק נתונים קיימים. להמשיך?",
          )
        ) {
          setBusy(false);
          await restore(b, true);
          return;
        }
        toast.warning("השחזור בוטל — הגיבוי ריק");
        return;
      }
      if (res.ok && data.ok) {
        success();
        toast.success("הגיבוי שוחזר", {
          description:
            "טען את הדף מחדש כדי לראות את הנתונים על המכשיר.",
        });
        await refresh();
      } else {
        toast.error(data.error ?? "השחזור נכשל");
      }
    } finally {
      setBusy(false);
    }
  }

  function snapshotPayload() {
    const store = useFinanceStore.getState();
    return {
      entries: store.entries,
      rules: store.rules,
      statuses: store.statuses,
      accounts: store.accounts,
      loans: store.loans,
      incomes: store.incomes,
      monthlyBudget: store.monthlyBudget,
      lastSyncedAt: store.lastSyncedAt,
      audioEnabled: store.audioEnabled,
    };
  }

  function exportLocal() {
    tap();
    const env = buildEnvelope({
      payload: snapshotPayload(),
      schemaVersion: 1,
      source:
        typeof navigator !== "undefined" ? navigator.userAgent : undefined,
    });
    downloadEnvelope(env);
    success();
    toast.success("גיבוי JSON הורד");
  }

  async function exportEncrypted() {
    tap();
    if (typeof window === "undefined") return;
    const passphrase = window.prompt(
      "הזן סיסמה לגיבוי המוצפן (לפחות 4 תווים).\nהסיסמה אינה ניתנת לשחזור — שמור אותה במקום בטוח.",
    );
    if (!passphrase || passphrase.length < 4) {
      toast.error("הסיסמה קצרה מדי");
      return;
    }
    try {
      const env = await encryptPayload(snapshotPayload(), passphrase);
      const blob = new Blob([JSON.stringify(env, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const stamp = new Date(env.exportedAt)
        .toISOString()
        .replace(/[:.]/g, "-");
      a.href = url;
      a.download = `sally-backup-encrypted-${stamp}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      success();
      toast.success("גיבוי מוצפן הורד");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "ההצפנה נכשלה");
    }
  }

  function triggerImport() {
    tap();
    fileRef.current?.click();
  }

  async function handleImportFile(file: File) {
    setBusy(true);
    try {
      const text = await file.text();
      // Detect encrypted envelope. If present, prompt for passphrase
      // and decrypt before falling through to the regular parser.
      let plainText = text;
      try {
        const maybeEnc = JSON.parse(text) as unknown;
        if (isEncryptedEnvelope(maybeEnc)) {
          const passphrase =
            typeof window === "undefined"
              ? null
              : window.prompt("הזן את הסיסמה לקובץ המוצפן");
          if (!passphrase) {
            toast.warning("ייבוא בוטל");
            return;
          }
          const result = await decryptEnvelope(maybeEnc, passphrase);
          if (!result.ok) {
            toast.error(
              result.reason === "wrong_passphrase"
                ? "סיסמה שגויה"
                : "הקובץ פגום",
            );
            return;
          }
          // After decrypt we hold the inner plaintext payload — wrap
          // it as if it had been a regular envelope so parseEnvelope
          // accepts it.
          const reWrapped = buildEnvelope({
            payload: result.payload,
            schemaVersion: 1,
            source: "decrypted",
          });
          plainText = JSON.stringify(reWrapped);
        }
      } catch {
        /* not encrypted — let parseEnvelope handle parsing */
      }
      const parsed = parseEnvelope(plainText);
      if (!parsed.ok) {
        toast.error(`הקובץ אינו תקף · ${parsed.reason}`);
        return;
      }
      const payload = parsed.envelope.payload as Record<string, unknown>;
      const liveSummary = currentLiveSummary();
      const importedRichness = countList(payload, [
        "entries",
        "rules",
        "accounts",
        "loans",
        "incomes",
      ]);
      const liveRichness =
        liveSummary.entries +
        liveSummary.rules +
        liveSummary.accounts +
        liveSummary.loans +
        liveSummary.incomes;
      const proceed =
        typeof window === "undefined"
          ? true
          : window.confirm(
              `ייבוא יחליף את המצב הנוכחי במכשיר (${liveRichness} פריטים) במצב מתוך הקובץ (${importedRichness} פריטים). להמשיך?`,
            );
      if (!proceed) return;
      // Safety net: take a cloud backup of the CURRENT live state before
      // the import overwrites it. Fire-and-await with a 3s cap so a
      // slow network doesn't block the import.
      if (liveRichness > 0) {
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 3000);
          await fetch("/api/backups", {
            method: "POST",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ reason: "manual" }),
            signal: controller.signal,
          });
          clearTimeout(timer);
        } catch {
          /* timeout / offline — proceed anyway */
        }
      }
      // Replace the persisted slice. Zustand setState merges shallow.
      const api = useFinanceStore.setState as (
        partial: Partial<ReturnType<typeof useFinanceStore.getState>>,
      ) => void;
      api({
        entries: (payload.entries as never[]) ?? [],
        rules: (payload.rules as never[]) ?? [],
        statuses: (payload.statuses as never[]) ?? [],
        accounts: (payload.accounts as never[]) ?? [],
        loans: (payload.loans as never[]) ?? [],
        incomes: (payload.incomes as never[]) ?? [],
        monthlyBudget:
          typeof payload.monthlyBudget === "number"
            ? (payload.monthlyBudget as number)
            : 0,
        audioEnabled:
          typeof payload.audioEnabled === "boolean"
            ? (payload.audioEnabled as boolean)
            : true,
        lastSyncedAt:
          typeof payload.lastSyncedAt === "number"
            ? (payload.lastSyncedAt as number)
            : 0,
      });
      success();
      toast.success("היבוא הצליח", {
        description: `${importedRichness} פריטים נטענו`,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "ייבוא נכשל");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function currentLiveSummary() {
    const s = useFinanceStore.getState();
    return {
      entries: s.entries.length,
      rules: s.rules.length,
      accounts: s.accounts.length,
      loans: s.loans.length,
      incomes: s.incomes.length,
      statuses: s.statuses.length,
      monthlyBudget: s.monthlyBudget,
    };
  }

  if (!hydrated) return null;

  return (
    <section className="rounded-2xl border border-border/60 bg-surface/50 p-5 backdrop-blur-md">
      <header className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="size-5 text-neon" />
          <div className="flex flex-col leading-tight">
            <div className="text-[11px] uppercase tracking-[0.25em] text-neon">
              גיבויים ושחזור
            </div>
            <div className="text-[11px] text-muted-foreground">
              גיבוי ענן בטוח לחשבון ה־Google שלך
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            tap();
            void refresh();
          }}
          aria-label="רענן"
          className="flex size-8 items-center justify-center rounded-lg border border-white/12 bg-background/40 text-muted-foreground transition-colors hover:border-white/30 hover:text-foreground"
        >
          <RefreshCcw className="size-3.5" />
        </button>
      </header>

      {authStatus === "no-session" ? (
        <p className="rounded-xl border border-dashed border-border/40 px-3 py-6 text-center text-[11px] text-muted-foreground">
          התחבר עם חשבון Google כדי להפעיל גיבוי ענן.
        </p>
      ) : authStatus === "kv-unavailable" ? (
        <p className="rounded-xl border border-dashed border-border/40 px-3 py-6 text-center text-[11px] text-muted-foreground">
          ענן לא מוגדר. ייצוא/ייבוא JSON עדיין פעיל.
        </p>
      ) : null}

      {/* Current state summary */}
      {current ? (
        <div className="mb-3 flex flex-col gap-1 rounded-2xl border border-white/10 bg-black/30 p-3">
          <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            <span>מצב נוכחי בענן</span>
            <span data-mono="true" dir="ltr">
              {fmtTime(current.updatedAt)}
            </span>
          </div>
          <SummaryRow s={current} />
        </div>
      ) : null}

      {/* Actions */}
      <div className="mb-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={busy || authStatus !== "ready"}
          onClick={manualBackup}
          className="flex items-center justify-center gap-1.5 rounded-xl border border-neon/40 bg-neon/10 px-3 py-2 text-[12px] font-medium text-neon transition-colors hover:bg-neon/20 disabled:opacity-50"
        >
          <CloudUpload className="size-3.5" />
          שמור גיבוי עכשיו
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={exportLocal}
          className="flex items-center justify-center gap-1.5 rounded-xl border border-white/12 bg-background/40 px-3 py-2 text-[12px] text-foreground transition-colors hover:border-white/30 disabled:opacity-50"
        >
          <Download className="size-3.5" />
          ייצוא JSON
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            void exportEncrypted();
          }}
          className="flex items-center justify-center gap-1.5 rounded-xl border border-[#D4AF37]/40 bg-[#D4AF37]/10 px-3 py-2 text-[12px] font-medium text-[#D4AF37] transition-colors hover:bg-[#D4AF37]/20 disabled:opacity-50"
        >
          <Lock className="size-3.5" />
          ייצוא מוצפן
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={triggerImport}
          className="flex items-center justify-center gap-1.5 rounded-xl border border-white/12 bg-background/40 px-3 py-2 text-[12px] text-foreground transition-colors hover:border-white/30 disabled:opacity-50"
        >
          <Upload className="size-3.5" />
          ייבוא מקובץ
        </button>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center justify-center gap-1.5 rounded-xl border border-white/12 bg-background/40 px-3 py-2 text-[12px] text-foreground transition-colors hover:border-white/30"
        >
          <History className="size-3.5" />
          {open ? "סגור רשימה" : `${backups.length} גיבויים`}
        </button>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleImportFile(file);
        }}
      />

      {/* Recommended hint */}
      {recommended && authStatus === "ready" ? (
        <div className="mb-3 flex items-center gap-2 rounded-2xl border border-[#34D399]/30 bg-[#34D399]/8 p-2.5 text-[11px]">
          <Sparkles className="size-3.5 text-[#34D399]" />
          <div className="flex-1 leading-tight text-foreground">
            <div className="font-medium">גיבוי מומלץ לשחזור</div>
            <div className="text-[10px] text-muted-foreground">
              {fmtTime(recommended.capturedAt)} · {recommended.richness} פריטים
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              const target = backups.find(
                (b) => b.capturedAt === recommended.capturedAt,
              );
              if (target) void restore(target);
            }}
            className="rounded-lg border border-[#34D399]/50 bg-[#34D399]/15 px-2.5 py-1 text-[11px] font-semibold text-[#34D399] transition-colors hover:bg-[#34D399]/25"
          >
            שחזר
          </button>
        </div>
      ) : null}

      {/* Backup list */}
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            {backups.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border/40 px-3 py-6 text-center text-[11px] text-muted-foreground">
                אין עדיין גיבויים שמורים בענן.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {backups.map((b) => {
                  const tone = REASON_TONE[b.reason] ?? "#A1A1AA";
                  const isRecommended =
                    recommended?.capturedAt === b.capturedAt;
                  return (
                    <li
                      key={b.capturedAt}
                      className="flex flex-col gap-1.5 rounded-2xl border border-white/8 bg-black/30 p-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span
                            className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold"
                            style={{
                              background: `${tone}22`,
                              color: tone,
                            }}
                          >
                            {REASON_LABEL[b.reason]}
                          </span>
                          {isRecommended ? (
                            <span className="rounded-full bg-[#34D399]/22 px-1.5 py-0.5 text-[9px] font-semibold text-[#34D399]">
                              מומלץ
                            </span>
                          ) : null}
                          <span
                            data-mono="true"
                            dir="ltr"
                            className="text-[11px] text-muted-foreground"
                          >
                            {fmtTime(b.capturedAt)}
                          </span>
                        </div>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void restore(b)}
                          className="flex items-center gap-1 rounded-lg border border-white/15 bg-background/40 px-2.5 py-1 text-[11px] text-foreground transition-colors hover:border-white/30 disabled:opacity-50"
                        >
                          <RotateCcw className="size-3" />
                          שחזר
                        </button>
                      </div>
                      <SummaryRow s={b} />
                    </li>
                  );
                })}
              </ul>
            )}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  );
}

function SummaryRow({ s }: { s: Summary }) {
  return (
    <div
      className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground"
      dir="ltr"
      data-mono="true"
    >
      <span>חיובים {s.entries}</span>
      <span>·</span>
      <span>חשבונות {s.accounts}</span>
      <span>·</span>
      <span>הלוואות {s.loans}</span>
      <span>·</span>
      <span>קבועים {s.rules}</span>
      <span>·</span>
      <span>הכנסות {s.incomes}</span>
      {s.monthlyBudget > 0 ? (
        <>
          <span>·</span>
          <span>תקציב {ILS.format(s.monthlyBudget)}</span>
        </>
      ) : null}
    </div>
  );
}

function countList(
  obj: Record<string, unknown>,
  keys: string[],
): number {
  let total = 0;
  for (const k of keys) {
    const v = obj[k];
    if (Array.isArray(v)) total += v.length;
  }
  return total;
}

// Imported but unused — keeping the surface obvious for readers.
void CloudDownload;
