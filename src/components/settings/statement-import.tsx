"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, FileText, AlertCircle } from "lucide-react";
import { useFinanceStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import {
  parseStatementCsv,
  type StatementRow,
} from "@/lib/parsers/statement-csv";
import type { Issuer } from "@/types/finance";
import type { CategoryId } from "@/lib/categories";
import { tap } from "@/lib/haptics";
import { toast } from "sonner";

const formatILS = (value: number) =>
  new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
    maximumFractionDigits: 0,
  }).format(value);

const dateFormatter = new Intl.DateTimeFormat("he-IL", {
  day: "numeric",
  month: "short",
});

function categorize(merchant: string): CategoryId {
  const m = merchant.toLowerCase();
  if (/(שופר|רמי|ויקטורי|אושר|טיב|יוחנ|מגה|grocer|supermarket|מסעד|פיצה|בורגר|cafe|coffee|מק.?דונל|קפה)/i.test(m)) return "food";
  if (/(דלק|paz|פז|sonol|סונול|delek|מנטה|תחנת|rav.?kav|רב.?קב|cab|taxi|מונית|gett|uber)/i.test(m)) return "transport";
  if (/(zara|h&m|next|fox|castro|amazon|aliexpress|shein|shop|חנות)/i.test(m)) return "shopping";
  if (/(cinema|yes.?planet|netflix|spotify|hot|partner|cellcom|פרטנר|סלקום|הוט)/i.test(m)) return "entertainment";
  if (/(electric|חברת חשמל|water|פלאפון|בזק|בית|מים|חשמל)/i.test(m)) return "bills";
  if (/(super.?pharm|פארם|clalit|מכבי|לאומית|kupat|רוקח|בריאות)/i.test(m)) return "health";
  if (/(school|education|חינוך|לימוד|בית ספר|גן)/i.test(m)) return "education";
  return "other";
}

type Stage =
  | { kind: "idle" }
  | { kind: "parsed"; issuer: Issuer; rows: StatementRow[]; warnings: string[] }
  | { kind: "error"; message: string };

export function StatementImport() {
  const addExpense = useFinanceStore((s) => s.addExpense);
  const [issuer, setIssuer] = useState<Issuer>("cal");
  const [stage, setStage] = useState<Stage>({ kind: "idle" });

  const onFile = async (file: File) => {
    if (file.size > 1024 * 1024) {
      setStage({ kind: "error", message: "קובץ גדול מ־1MB" });
      return;
    }
    const text = await file.text();
    const r = parseStatementCsv(text, issuer);
    if (!r.ok) {
      const detail =
        r.reason === "missing_required_columns"
          ? "החסרים: תאריך, סכום, או שם בית עסק"
          : r.reason;
      setStage({ kind: "error", message: detail });
      return;
    }
    if (r.rows.length === 0) {
      setStage({ kind: "error", message: "לא נמצאו שורות תקינות" });
      return;
    }
    setStage({
      kind: "parsed",
      issuer,
      rows: r.rows.slice(0, 200), // hard cap for the preview
      warnings: r.warnings,
    });
  };

  const commit = () => {
    if (stage.kind !== "parsed") return;
    let added = 0;
    let duplicates = 0;
    for (const row of stage.rows) {
      const externalId = `import:${stage.issuer}:${row.date}:${row.amount}:${row.merchant}`.slice(
        0,
        96,
      );
      const result = addExpense({
        amount: row.amount,
        category: categorize(row.merchant),
        installments: 1,
        paymentMethod: "credit",
        source: "auto",
        chargeDate: row.date,
        externalId,
        issuer: stage.issuer,
        cardLast4: row.cardLast4,
        merchant: row.merchant,
      });
      if (result.duplicate) duplicates += 1;
      else added += 1;
    }
    tap();
    toast.success(`יובאו ${added} עסקאות${duplicates > 0 ? ` · ${duplicates} כפילויות דולגו` : ""}`);
    setStage({ kind: "idle" });
  };

  return (
    <section className="rounded-2xl border border-border/60 bg-surface/50 p-5 backdrop-blur-md">
      <header className="mb-4 flex items-center gap-2">
        <Upload className="size-4 text-neon" />
        <div>
          <div className="text-sm font-medium text-foreground">
            ייבוא דף חיוב
          </div>
          <div className="text-[11px] text-muted-foreground">
            הורד CSV מהאזור האישי של חברת האשראי וטען אותו כאן
          </div>
        </div>
      </header>

      <div className="mb-3 flex gap-2">
        {(["cal", "max"] as const).map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setIssuer(id)}
            className={`flex-1 rounded-xl border px-3 py-2 text-xs transition-colors ${
              issuer === id
                ? "border-neon/60 bg-background/80 text-foreground"
                : "border-border/60 bg-background/40 text-muted-foreground hover:border-border"
            }`}
          >
            {id.toUpperCase()}
          </button>
        ))}
      </div>

      <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-border/60 bg-background/40 px-4 py-6 text-sm text-muted-foreground transition-colors hover:border-neon/50 hover:text-foreground">
        <FileText className="size-4" />
        בחר קובץ CSV
        <input
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onFile(f);
            e.target.value = "";
          }}
        />
      </label>

      <AnimatePresence>
        {stage.kind === "error" ? (
          <motion.div
            key="err"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mt-3 flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-2.5 text-xs text-destructive"
          >
            <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
            <span>הפענוח נכשל: {stage.message}</span>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {stage.kind === "parsed" ? (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-4 space-y-3"
        >
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{stage.rows.length} שורות זוהו</span>
            <span>סה&quot;כ {formatILS(stage.rows.reduce((s, r) => s + r.amount, 0))}</span>
          </div>

          <ul className="max-h-60 space-y-1 overflow-y-auto rounded-xl border border-border/40 bg-background/40 p-2">
            {stage.rows.slice(0, 30).map((r, i) => (
              <li
                key={`${r.date}-${i}`}
                className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-[11px]"
              >
                <span className="text-muted-foreground">
                  {dateFormatter.format(new Date(r.date))}
                </span>
                <span className="flex-1 truncate text-foreground">
                  {r.merchant}
                </span>
                <span
                  data-mono="true"
                  className="text-foreground"
                  style={{ direction: "ltr" }}
                >
                  {formatILS(r.amount)}
                </span>
              </li>
            ))}
            {stage.rows.length > 30 ? (
              <li className="px-2 py-1 text-center text-[10px] text-muted-foreground/60">
                + {stage.rows.length - 30} שורות נוספות
              </li>
            ) : null}
          </ul>

          {stage.warnings.length > 0 ? (
            <p className="text-[11px] text-muted-foreground">
              {stage.warnings.length} שורות דולגו (לא תקינות)
            </p>
          ) : null}

          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setStage({ kind: "idle" })}
              className="h-9"
            >
              ביטול
            </Button>
            <Button
              type="button"
              onClick={commit}
              className="h-9 bg-neon text-[#050505] hover:bg-neon/90"
            >
              ייבא {stage.rows.length}
            </Button>
          </div>
        </motion.div>
      ) : null}
    </section>
  );
}
