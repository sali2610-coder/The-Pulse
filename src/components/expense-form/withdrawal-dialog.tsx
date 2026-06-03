"use client";

// Phase 348 — Withdrawal entry sheet.
//
// Standalone bottom-sheet for "משיכה" (cash withdrawal / Bit /
// PayBox / transfer / savings move / etc.). Persists via the same
// store.addExpense path so liquidity-curve + Pulse still see the
// money leave the bank — the entry just carries:
//
//   transactionType: "withdrawal"
//   withdrawalKind:  "atm" | "bit" | "paybox" | ...
//   withdrawalDestination?: free text
//   category: "other"  (withdrawals are not consumer expenses)
//
// Downstream surfaces can split "spent" from "moved" via the
// transactionType flag.

import { useRef } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowDownToLine, Wallet } from "lucide-react";

import { BottomSheet } from "@/components/ui/bottom-sheet";
import { useFinanceStore } from "@/lib/store";
import { tap, success as hapticsSuccess } from "@/lib/haptics";
import { AmountInput } from "./amount-input";
import { SourceAccountPicker } from "./source-account-picker";
import { PaymentDatePicker } from "./payment-date-picker";

type WithdrawalKind =
  | "cash"
  | "atm"
  | "transfer"
  | "bit"
  | "paybox"
  | "business"
  | "owner"
  | "investment"
  | "savings"
  | "other";

const KINDS: Array<{ id: WithdrawalKind; label: string }> = [
  { id: "atm", label: "כספומט" },
  { id: "cash", label: "מזומן" },
  { id: "transfer", label: "העברה לחשבון" },
  { id: "bit", label: "ביט" },
  { id: "paybox", label: "פייבוקס" },
  { id: "savings", label: "חיסכון" },
  { id: "investment", label: "השקעה" },
  { id: "business", label: "עסקית" },
  { id: "owner", label: "משיכת בעלים" },
  { id: "other", label: "אחר" },
];

type FormValues = {
  amount: number | undefined;
  kind: WithdrawalKind;
  source: "bank" | "cash";
  accountId?: string;
  destination?: string;
  note?: string;
  paymentDate: string;
};

function todayNoonIso(): string {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  return d.toISOString();
}

export function WithdrawalDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const addExpense = useFinanceStore((s) => s.addExpense);
  const formRef = useRef<HTMLFormElement | null>(null);
  const amountRef = useRef<HTMLInputElement | null>(null);

  const {
    control,
    handleSubmit,
    reset,
    formState: { isValid },
  } = useForm<FormValues>({
    mode: "onChange",
    defaultValues: {
      amount: undefined,
      kind: "atm",
      source: "bank",
      accountId: undefined,
      destination: "",
      note: "",
      paymentDate: todayNoonIso(),
    },
  });

  const watchedSource = useWatch({ control, name: "source" });

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      if (!values.amount || values.amount <= 0) {
        throw new Error("יש להזין סכום");
      }
      if (values.source === "bank" && !values.accountId) {
        throw new Error("יש לבחור חשבון בנק");
      }
      const paymentMethod = values.source === "bank" ? "cash" : "cash";
      const result = addExpense({
        amount: values.amount,
        category: "other",
        note: values.note?.trim() || undefined,
        installments: 1,
        paymentMethod,
        source: "manual",
        accountId: values.accountId,
        chargeDate: values.paymentDate,
        transactionType: "withdrawal",
        withdrawalKind: values.kind,
        withdrawalDestination: values.destination?.trim() || undefined,
      });
      return result;
    },
    onSuccess: ({ duplicate }) => {
      if (duplicate) {
        toast.warning("זוהה כדומה למשיכה קיימת — לא נשמר שוב.");
        return;
      }
      hapticsSuccess();
      toast.success("משיכה נשמרה.");
      reset({
        amount: undefined,
        kind: "atm",
        source: "bank",
        accountId: undefined,
        destination: "",
        note: "",
        paymentDate: todayNoonIso(),
      });
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast.error(err.message ?? "שמירה נכשלה");
    },
  });

  const submit = handleSubmit((values) => mutation.mutate(values));
  const requestSubmit = () => formRef.current?.requestSubmit();

  return (
    <BottomSheet
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          mutation.reset();
          reset({
            amount: undefined,
            kind: "atm",
            source: "bank",
            accountId: undefined,
            destination: "",
            note: "",
            paymentDate: todayNoonIso(),
          });
        }
        onOpenChange(o);
      }}
      title="משיכה חדשה"
      fullScreen
      lockDismiss
      footer={
        <div className="flex gap-2.5 px-4">
          <button
            type="button"
            onClick={() => {
              tap();
              onOpenChange(false);
            }}
            className="flex h-12 flex-1 items-center justify-center rounded-2xl border border-white/12 bg-black/40 text-[14px] font-medium text-muted-foreground transition-colors hover:border-white/24 hover:text-foreground"
          >
            ביטול
          </button>
          <button
            type="button"
            onClick={() => {
              tap();
              requestSubmit();
            }}
            disabled={!isValid || mutation.isPending}
            className="flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl text-[14px] font-semibold transition-transform active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
            style={{
              background: "linear-gradient(180deg, #D4AF37 0%, #A68422 100%)",
              color: "#1A140A",
              boxShadow:
                "0 1px 0 rgba(255,255,255,0.2) inset, 0 8px 24px -8px rgba(212,175,55,0.5)",
            }}
          >
            {mutation.isPending ? "שומר..." : "שמור משיכה"}
          </button>
        </div>
      }
    >
      <div className="relative flex flex-col gap-3 px-1 pt-1">
        <header className="flex items-baseline justify-between gap-2">
          <h2 className="text-right text-[17px] font-semibold text-foreground">
            משיכה חדשה
          </h2>
          <span className="inline-flex items-center gap-1 rounded-full bg-[#D4AF37]/15 px-2 py-0.5 text-[10.5px] font-medium text-[#D4AF37]">
            <ArrowDownToLine className="size-3" />
            יורד מהבנק
          </span>
        </header>

        <form ref={formRef} onSubmit={submit} className="flex flex-col gap-3">
          <Controller
            control={control}
            name="amount"
            rules={{ required: true, min: 0.01 }}
            render={({ field }) => (
              <AmountInput
                ref={(el) => {
                  field.ref(el);
                  amountRef.current = el;
                }}
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
              />
            )}
          />

          <Controller
            control={control}
            name="kind"
            render={({ field }) => (
              <KindGrid value={field.value} onChange={field.onChange} />
            )}
          />

          <Controller
            control={control}
            name="source"
            render={({ field: srcField }) => (
              <Controller
                control={control}
                name="accountId"
                render={({ field: accField }) => (
                  <SourceAccountPicker
                    source={srcField.value === "bank" ? "bank" : "cash"}
                    accountId={accField.value}
                    onSource={(v) =>
                      srcField.onChange(v === "bank" ? "bank" : "cash")
                    }
                    onAccount={accField.onChange}
                  />
                )}
              />
            )}
          />

          <Controller
            control={control}
            name="destination"
            render={({ field }) => (
              <label className="flex flex-col gap-1 text-caption text-muted-foreground">
                <span>יעד המשיכה (לא חובה)</span>
                <input
                  type="text"
                  maxLength={60}
                  value={field.value ?? ""}
                  onChange={field.onChange}
                  placeholder="לדוגמה: חיסכון / אבא / בנק אחר"
                  className="h-10 rounded-2xl border border-white/10 bg-surface/60 px-3 text-[13px] text-foreground placeholder:text-muted-foreground/70 focus:border-[#D4AF37]/60 focus:outline-none"
                />
              </label>
            )}
          />

          <Controller
            control={control}
            name="note"
            render={({ field }) => (
              <label className="flex flex-col gap-1 text-caption text-muted-foreground">
                <span>הערה (לא חובה)</span>
                <textarea
                  rows={2}
                  maxLength={200}
                  value={field.value ?? ""}
                  onChange={field.onChange}
                  className="resize-none rounded-2xl border border-white/10 bg-surface/60 px-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground/70 focus:border-[#D4AF37]/60 focus:outline-none"
                />
              </label>
            )}
          />

          <Controller
            control={control}
            name="paymentDate"
            render={({ field }) => (
              <PaymentDatePicker
                value={field.value}
                onChange={field.onChange}
              />
            )}
          />

          <p className="rounded-xl border border-white/8 bg-black/25 px-3 py-2 text-[11px] text-muted-foreground/85">
            <Wallet className="me-1 inline size-3 text-[#D4AF37]" />
            משיכות יורדות מיד מהבנק ומשפיעות על תחזית התזרים, אבל לא
            נחשבות הוצאה צרכנית. הן יופיעו בנפרד בדוחות.
            {watchedSource === "cash" ? (
              <>
                {" "}
                במזומן נטהר ישירות מהיתרה — הוסף גם חשבון בנק אם תרצה
                עקיבה מדויקת.
              </>
            ) : null}
          </p>
        </form>
      </div>
    </BottomSheet>
  );
}

function KindGrid({
  value,
  onChange,
}: {
  value: WithdrawalKind;
  onChange: (next: WithdrawalKind) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
        סוג משיכה
      </span>
      <div
        className="grid grid-cols-2 gap-1.5"
        role="radiogroup"
        aria-label="סוג משיכה"
      >
        {KINDS.map((k) => {
          const active = value === k.id;
          return (
            <button
              key={k.id}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={`בחר סוג משיכה: ${k.label}`}
              onClick={() => {
                tap();
                onChange(k.id);
              }}
              className={`rounded-2xl border px-3 py-2 text-start text-[12.5px] font-medium transition-colors ${
                active
                  ? "border-[#D4AF37]/60 bg-[#D4AF37]/12 text-[#D4AF37] shadow-[inset_0_0_0_1px_#D4AF3755]"
                  : "border-white/10 bg-surface/60 text-foreground/85 hover:border-white/20"
              }`}
            >
              {k.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
