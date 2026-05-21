"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AnimatePresence, motion } from "framer-motion";
import { CalendarClock, Repeat } from "lucide-react";

import {
  recurringRuleFormSchema,
  type RecurringRuleFormValues,
} from "@/lib/schema";
import { CATEGORIES } from "@/lib/categories";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useFinanceStore } from "@/lib/store";
import { tap } from "@/lib/haptics";
import type { RecurringRule } from "@/types/finance";

const MONTH_NAMES = [
  "ינואר",
  "פברואר",
  "מרץ",
  "אפריל",
  "מאי",
  "יוני",
  "יולי",
  "אוגוסט",
  "ספטמבר",
  "אוקטובר",
  "נובמבר",
  "דצמבר",
];

type SubmitInput = {
  label: string;
  category: RecurringRuleFormValues["category"];
  estimatedAmount: number;
  dayOfMonth: number;
  keywords: string[];
  installmentTotal?: number;
  startMonth?: number;
  startYear?: number;
  paymentSource?: "bank" | "card" | "cash" | "unknown";
  linkedCardId?: string;
};

type Mode = "regular" | "installment";

type Props = {
  initial?: RecurringRule;
  submitLabel: string;
  onSubmit: (values: SubmitInput) => void;
  onCancel?: () => void;
};

export function RuleForm({ initial, submitLabel, onSubmit, onCancel }: Props) {
  const initialMode: Mode =
    initial?.installmentTotal && initial.installmentTotal > 0
      ? "installment"
      : "regular";
  const [mode, setMode] = useState<Mode>(initialMode);
  const [paymentSource, setPaymentSource] = useState<
    "bank" | "card" | "cash" | "unknown"
  >(initial?.paymentSource ?? "unknown");
  const [linkedCardId, setLinkedCardId] = useState<string | undefined>(
    initial?.linkedCardId,
  );
  // CRITICAL: subscribe to the raw accounts array, then derive the
  // card subset via useMemo. Subscribing to `s.accounts.filter(...)`
  // returns a fresh array on every store read — Zustand v5 + React 19
  // treats that as a continuous state change which throws
  // "Maximum update depth exceeded" once the form mounts inside the
  // settings card. This pattern is the same one used by
  // ExpenseEditSheet (Phase 92) which works correctly.
  const accounts = useFinanceStore((s) => s.accounts);
  const cards = useMemo(
    () => accounts.filter((a) => a.kind === "card" && a.active),
    [accounts],
  );
  const now = new Date();

  const {
    control,
    handleSubmit,
    formState: { errors, isValid },
  } = useForm<RecurringRuleFormValues>({
    resolver: zodResolver(recurringRuleFormSchema),
    mode: "onChange",
    defaultValues: {
      label: initial?.label ?? "",
      category: initial?.category,
      estimatedAmount: initial?.estimatedAmount,
      dayOfMonth: initial?.dayOfMonth ?? 1,
      keywords: initial?.keywords.join(", ") ?? "",
      installmentTotal: initial?.installmentTotal,
      startMonth: initial?.startMonth ?? now.getMonth() + 1,
      startYear: initial?.startYear ?? now.getFullYear(),
    },
  });

  const submit = handleSubmit((values) => {
    const payload: SubmitInput = {
      label: values.label,
      category: values.category,
      estimatedAmount: values.estimatedAmount,
      dayOfMonth: values.dayOfMonth,
      keywords: (values.keywords ?? "")
        .split(",")
        .map((k) => k.trim())
        .filter((k) => k.length > 0),
    };
    if (mode === "installment") {
      payload.installmentTotal = values.installmentTotal;
      payload.startMonth = values.startMonth;
      payload.startYear = values.startYear;
    }
    payload.paymentSource = paymentSource;
    payload.linkedCardId =
      paymentSource === "card" ? linkedCardId : undefined;
    onSubmit(payload);
  });

  // Scroll the form into view as soon as it mounts. Without this,
  // tapping "+חדשה" deep inside Settings would mount the form below
  // the user's current scroll position — they'd see only the
  // surrounding chrome and assume the action did nothing.
  const formRef = useRef<HTMLFormElement | null>(null);
  useEffect(() => {
    const t = setTimeout(() => {
      formRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }, 80);
    return () => clearTimeout(t);
  }, []);

  return (
    <motion.form
      ref={formRef}
      onSubmit={submit}
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      className="relative z-10 space-y-4 rounded-2xl border border-border/60 bg-surface/60 p-4"
    >
      {/* Mode toggle */}
      <div className="grid grid-cols-2 gap-2 rounded-2xl border border-white/8 bg-background/40 p-1">
        {(
          [
            { id: "regular" as const, label: "קבועה חודשית", Icon: Repeat },
            {
              id: "installment" as const,
              label: "פריסת תשלומים",
              Icon: CalendarClock,
            },
          ]
        ).map(({ id, label, Icon }) => {
          const active = mode === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => {
                tap();
                setMode(id);
              }}
              className={`flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-medium transition-colors ${
                active
                  ? "bg-[color:var(--neon)]/15 text-[color:var(--neon)] shadow-[inset_0_0_0_1px_var(--neon)]"
                  : "text-muted-foreground hover:bg-white/4 hover:text-foreground"
              }`}
            >
              <Icon className="size-4" />
              {label}
            </button>
          );
        })}
      </div>
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        {mode === "regular"
          ? "הוצאה חודשית שחוזרת לכל החיים — חשמל, ועד בית, שכ״ד, אינטרנט. נכנסת לתחזית בכל חודש עד שתכבה אותה ידנית."
          : "רכישה עם פריסה — טלוויזיה ב־12 תשלומים, רהיט ב־24. המערכת מקדמת אוטומטית 1/12 → 2/12 → ... ועוצרת בתשלום האחרון."}
      </p>

      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <Label htmlFor="rule-label" className="mb-1.5 text-xs">
            {mode === "regular" ? "שם ההוצאה" : "שם הרכישה"}
          </Label>
          <Controller
            control={control}
            name="label"
            render={({ field }) => (
              <Input
                id="rule-label"
                placeholder={
                  mode === "regular"
                    ? 'לדוגמה: "חשמל"'
                    : 'לדוגמה: "טלוויזיה Samsung"'
                }
                value={field.value ?? ""}
                onChange={field.onChange}
                onBlur={field.onBlur}
              />
            )}
          />
          {errors.label?.message ? (
            <p className="mt-1 text-[11px] text-destructive">
              {errors.label.message}
            </p>
          ) : null}
        </div>

        <div>
          <Label htmlFor="rule-amount" className="mb-1.5 text-xs">
            תשלום חודשי (₪)
          </Label>
          <Controller
            control={control}
            name="estimatedAmount"
            render={({ field }) => (
              <Input
                id="rule-amount"
                type="text"
                inputMode="decimal"
                dir="ltr"
                placeholder="0"
                value={
                  field.value === undefined || Number.isNaN(field.value)
                    ? ""
                    : String(field.value)
                }
                onChange={(e) => {
                  const raw = e.target.value.replace(/[^\d.]/g, "");
                  field.onChange(raw === "" ? undefined : Number(raw));
                }}
                onBlur={field.onBlur}
              />
            )}
          />
          {errors.estimatedAmount?.message ? (
            <p className="mt-1 text-[11px] text-destructive">
              {errors.estimatedAmount.message}
            </p>
          ) : null}
        </div>

        <div>
          <Label htmlFor="rule-day" className="mb-1.5 text-xs">
            יום בחודש
          </Label>
          <Controller
            control={control}
            name="dayOfMonth"
            render={({ field }) => (
              <Input
                id="rule-day"
                type="number"
                min={1}
                max={31}
                dir="ltr"
                value={field.value ?? ""}
                onChange={(e) => {
                  const num = Number(e.target.value);
                  field.onChange(Number.isFinite(num) ? num : undefined);
                }}
                onBlur={field.onBlur}
              />
            )}
          />
          {errors.dayOfMonth?.message ? (
            <p className="mt-1 text-[11px] text-destructive">
              {errors.dayOfMonth.message}
            </p>
          ) : null}
        </div>
      </div>

      {/* Installment-only fields */}
      <AnimatePresence initial={false}>
        {mode === "installment" ? (
          <motion.div
            key="installment-fields"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="grid grid-cols-3 gap-2 overflow-hidden"
          >
            <div>
              <Label htmlFor="rule-total" className="mb-1.5 text-xs">
                מס׳ תשלומים
              </Label>
              <Controller
                control={control}
                name="installmentTotal"
                render={({ field }) => (
                  <Input
                    id="rule-total"
                    type="text"
                    inputMode="numeric"
                    dir="ltr"
                    placeholder="12"
                    value={
                      field.value === undefined || Number.isNaN(field.value)
                        ? ""
                        : String(field.value)
                    }
                    onChange={(e) => {
                      const raw = e.target.value.replace(/[^\d]/g, "");
                      field.onChange(raw === "" ? undefined : Number(raw));
                    }}
                  />
                )}
              />
            </div>
            <div>
              <Label htmlFor="rule-start-month" className="mb-1.5 text-xs">
                חודש התחלה
              </Label>
              <Controller
                control={control}
                name="startMonth"
                render={({ field }) => (
                  <select
                    id="rule-start-month"
                    value={field.value ?? now.getMonth() + 1}
                    onChange={(e) => field.onChange(Number(e.target.value))}
                    className="h-9 w-full rounded-lg border border-input bg-transparent px-2 text-sm text-foreground outline-none"
                  >
                    {MONTH_NAMES.map((name, idx) => (
                      <option key={idx} value={idx + 1}>
                        {name}
                      </option>
                    ))}
                  </select>
                )}
              />
            </div>
            <div>
              <Label htmlFor="rule-start-year" className="mb-1.5 text-xs">
                שנה
              </Label>
              <Controller
                control={control}
                name="startYear"
                render={({ field }) => (
                  <Input
                    id="rule-start-year"
                    type="text"
                    inputMode="numeric"
                    dir="ltr"
                    maxLength={4}
                    value={
                      field.value === undefined ? "" : String(field.value)
                    }
                    onChange={(e) => {
                      const raw = e.target.value
                        .replace(/[^\d]/g, "")
                        .slice(0, 4);
                      field.onChange(raw === "" ? undefined : Number(raw));
                    }}
                  />
                )}
              />
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <div>
        <Label className="mb-2 block text-xs">קטגוריה</Label>
        <Controller
          control={control}
          name="category"
          render={({ field }) => (
            <div className="grid grid-cols-3 gap-2">
              {CATEGORIES.map((c) => {
                const Icon = c.icon;
                const selected = field.value === c.id;
                return (
                  <motion.button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      tap();
                      field.onChange(c.id);
                    }}
                    whileTap={{ scale: 0.95 }}
                    whileHover={{ y: -1 }}
                    className={`flex flex-col items-center justify-center gap-1.5 rounded-2xl border px-2 py-3 text-[11px] font-medium transition-colors ${
                      selected
                        ? "border-[color:var(--neon)]/70 bg-[color:var(--neon)]/10 text-foreground shadow-[0_0_0_1px_var(--neon),0_0_18px_-6px_var(--neon)]"
                        : "border-border/60 text-muted-foreground hover:border-border"
                    }`}
                    style={selected ? { color: c.accent } : undefined}
                  >
                    <Icon
                      className="size-5"
                      style={{ color: selected ? c.accent : undefined }}
                      strokeWidth={selected ? 2 : 1.6}
                    />
                    {c.label}
                  </motion.button>
                );
              })}
            </div>
          )}
        />
        {errors.category?.message ? (
          <p className="mt-1 text-[11px] text-destructive">
            {errors.category.message}
          </p>
        ) : null}
      </div>

      {mode === "regular" ? (
        <div>
          <Label htmlFor="rule-keywords" className="mb-1.5 text-xs">
            מילות מפתח (לשידוך אוטומטי — מופרדות בפסיק)
          </Label>
          <Controller
            control={control}
            name="keywords"
            render={({ field }) => (
              <Input
                id="rule-keywords"
                placeholder="חשמל, חברת חשמל"
                value={field.value ?? ""}
                onChange={field.onChange}
                onBlur={field.onBlur}
              />
            )}
          />
        </div>
      ) : null}

      {/* Payment source (Phase 85) */}
      <div className="space-y-2 rounded-xl border border-white/8 bg-background/40 p-3">
        <Label className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          איך משלמים את החיוב?
        </Label>
        <div className="grid grid-cols-4 gap-1.5">
          {(
            [
              { id: "bank", label: "בנק" },
              { id: "card", label: "כרטיס" },
              { id: "cash", label: "מזומן" },
              { id: "unknown", label: "—" },
            ] as const
          ).map(({ id, label }) => {
            const active = paymentSource === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setPaymentSource(id)}
                className={`rounded-lg border px-2 py-1.5 text-[11px] transition-colors ${
                  active
                    ? "border-[color:var(--neon)]/60 bg-[color:var(--neon)]/12 text-[color:var(--neon)]"
                    : "border-white/10 bg-background/40 text-muted-foreground hover:border-white/20"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
        {paymentSource === "card" ? (
          <div className="flex flex-col gap-1">
            <Label className="text-[10px] text-muted-foreground">
              לאיזה כרטיס לקשר?
            </Label>
            <select
              value={linkedCardId ?? ""}
              onChange={(e) => setLinkedCardId(e.target.value || undefined)}
              className="h-9 rounded-lg border border-white/12 bg-background/60 px-2 text-[12px] text-foreground outline-none focus:border-[color:var(--neon)]/60"
            >
              <option value="">בלי כרטיס מסוים</option>
              {cards.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                  {c.cardLast4 ? ` · ····${c.cardLast4}` : ""}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </div>

      <div className="flex items-center justify-end gap-2 pt-1">
        {onCancel ? (
          <Button
            type="button"
            variant="ghost"
            onClick={onCancel}
            className="h-9"
          >
            ביטול
          </Button>
        ) : null}
        <Button
          type="submit"
          disabled={!isValid}
          className="h-9 bg-neon text-[#050505] hover:bg-neon/90 disabled:opacity-40"
        >
          {submitLabel}
        </Button>
      </div>
    </motion.form>
  );
}
