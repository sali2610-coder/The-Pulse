"use client";

import { useEffect, useRef, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft } from "lucide-react";

import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Textarea } from "@/components/ui/textarea";

import { expenseFormSchema, type ExpenseFormValues } from "@/lib/schema";
import { postExpense } from "@/lib/api";
import { getOrCreateDeviceId } from "@/lib/device-id";
import { success as hapticsSuccess, tap } from "@/lib/haptics";
import { useFinanceStore } from "@/lib/store";
import { getCategory, type CategoryId } from "@/lib/categories";
import type { ExpensePayload } from "@/types/expense";

import { AmountInput } from "./amount-input";
import { InstallmentsInput } from "./installments-input";
import { SourceAccountPicker } from "./source-account-picker";
import { ExpenseImpactPreview } from "./expense-impact-preview";
import { SuccessOverlay } from "./success-overlay";
import { CategoryPickerSheet } from "@/components/confirmation/category-picker-sheet";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * The manual-entry sheet. Originally a centered Dialog; now a premium
 * bottom-sheet that matches PendingTray + ConfirmationSheet styling.
 * Category picker is a separate sheet opened from a chip in this form so
 * the surface stays compact on mobile.
 */
export function ExpenseDialog({ open, onOpenChange }: Props) {
  const [showSuccess, setShowSuccess] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const amountRef = useRef<HTMLInputElement | null>(null);
  const addExpense = useFinanceStore((s) => s.addExpense);

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors, isValid },
  } = useForm<ExpenseFormValues>({
    resolver: zodResolver(expenseFormSchema),
    mode: "onChange",
    defaultValues: {
      amount: undefined,
      category: undefined,
      paymentSource: "card",
      accountId: undefined,
      installments: 1,
      note: "",
    },
  });

  const watchedAmount = useWatch({ control, name: "amount" });
  const watchedCategory = useWatch({ control, name: "category" });
  const watchedSource = useWatch({ control, name: "paymentSource" });
  const watchedAccount = useWatch({ control, name: "accountId" });
  const watchedInstallments = useWatch({ control, name: "installments" });

  const mutation = useMutation({
    mutationFn: async (values: ExpenseFormValues) => {
      // Phase 244 — translate user-facing paymentSource into the
      // store's PaymentMethod + accountId pair. "bank" maps to
      // cash + bank-account-id so the future-balance engine debits
      // the right account.
      const paymentMethod =
        values.paymentSource === "card" ? "credit" : "cash";
      const result = addExpense({
        amount: values.amount,
        category: values.category,
        note: values.note?.trim() || undefined,
        installments: values.installments,
        paymentMethod,
        source: "manual",
        accountId: values.accountId,
      });

      const payload: ExpensePayload = {
        amount: values.amount,
        category: values.category,
        note: values.note?.trim() || undefined,
        timestamp: new Date().toISOString(),
        deviceId: getOrCreateDeviceId(),
      };

      try {
        await postExpense(payload);
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "שליחה ל־endpoint נכשלה";
        toast.warning(`נשמר מקומית. ${msg}`);
      }

      return result;
    },
    onSuccess: ({ matched }) => {
      hapticsSuccess();
      setShowSuccess(true);
      if (matched) {
        toast.success(`שודך אוטומטית: ${matched.label}`);
      }
      closeTimer.current = setTimeout(() => {
        setShowSuccess(false);
        reset();
        onOpenChange(false);
      }, 1400);
    },
    onError: (err: Error) => {
      toast.error(err.message ?? "שמירה נכשלה");
    },
  });

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => amountRef.current?.focus(), 120);
    return () => clearTimeout(t);
  }, [open]);

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      if (closeTimer.current) {
        clearTimeout(closeTimer.current);
        closeTimer.current = null;
      }
      setShowSuccess(false);
      mutation.reset();
      reset();
    }
    onOpenChange(next);
  };

  const submit = handleSubmit((values) => mutation.mutate(values));

  // Phase 326 — promoted to full-screen sheet with a sticky
  // two-button footer (ביטול / שמור הוצאה). Body owns the form
  // fields with breathing-room spacing; footer never gets pushed by
  // content or by the iOS keyboard because it lives outside the
  // scroll container.
  const formId = "expense-form";

  return (
    <>
      <BottomSheet
        open={open}
        onOpenChange={handleOpenChange}
        title="תיעוד הוצאה"
        fullScreen
        footer={
          <div className="flex gap-2.5 px-4">
            <button
              type="button"
              onClick={() => {
                tap();
                handleOpenChange(false);
              }}
              className="flex h-12 flex-1 items-center justify-center rounded-2xl border border-white/12 bg-black/40 text-[14px] font-medium text-muted-foreground transition-colors hover:border-white/24 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--neon)]/60 active:scale-[0.99]"
            >
              ביטול
            </button>
            <button
              type="submit"
              form={formId}
              disabled={!isValid || mutation.isPending}
              className="btn-confirm flex h-12 flex-1 items-center justify-center rounded-2xl text-[14px] font-semibold transition-transform active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100"
            >
              {mutation.isPending ? "שומר..." : "שמור הוצאה"}
            </button>
          </div>
        }
      >
        <div className="relative flex flex-col gap-5 px-1 pt-2">
          <header className="flex flex-col gap-1">
            <h2 className="text-right text-[20px] font-semibold text-foreground">
              תיעוד הוצאה
            </h2>
            <p className="text-right text-[12.5px] text-muted-foreground">
              מזומן, אונליין, או כל הוצאה ידנית.
            </p>
          </header>

          <form id={formId} onSubmit={submit} className="flex flex-col gap-5">
            <Controller
              control={control}
              name="amount"
              render={({ field }) => (
                <AmountInput
                  ref={(el) => {
                    field.ref(el);
                    amountRef.current = el;
                  }}
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  hasError={Boolean(errors.amount)}
                />
              )}
            />
            <AnimatePresence>
              {errors.amount?.message ? (
                <motion.p
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="text-center text-xs text-destructive"
                >
                  {errors.amount.message}
                </motion.p>
              ) : null}
            </AnimatePresence>

            <Controller
              control={control}
              name="category"
              render={({ field }) => (
                <CategoryChip
                  value={field.value}
                  hasError={Boolean(errors.category)}
                  onOpen={() => {
                    tap();
                    setPickerOpen(true);
                  }}
                />
              )}
            />

            <Controller
              control={control}
              name="paymentSource"
              render={({ field }) => (
                <Controller
                  control={control}
                  name="accountId"
                  render={({ field: accField }) => (
                    <SourceAccountPicker
                      source={field.value}
                      accountId={accField.value}
                      onSource={field.onChange}
                      onAccount={accField.onChange}
                      errorMessage={errors.accountId?.message}
                    />
                  )}
                />
              )}
            />

            <Controller
              control={control}
              name="installments"
              render={({ field }) => (
                <InstallmentsInput
                  value={field.value}
                  onChange={field.onChange}
                  amount={watchedAmount}
                />
              )}
            />

            <ExpenseImpactPreview
              amount={watchedAmount}
              category={watchedCategory}
              paymentMethod={watchedSource === "card" ? "credit" : "cash"}
              accountId={watchedAccount}
              installments={watchedInstallments}
              source={watchedSource}
            />

            <Controller
              control={control}
              name="note"
              render={({ field }) => (
                <Textarea
                  placeholder="הערה (לא חובה)"
                  rows={2}
                  maxLength={200}
                  className="resize-none border-white/10 bg-surface/60"
                  value={field.value ?? ""}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                />
              )}
            />
          </form>

          <SuccessOverlay open={showSuccess} />
        </div>
      </BottomSheet>

      <Controller
        control={control}
        name="category"
        render={({ field }) => (
          <CategoryPickerSheet
            open={pickerOpen}
            onOpenChange={setPickerOpen}
            selected={field.value}
            onSelect={(id) => field.onChange(id)}
          />
        )}
      />
    </>
  );
}

function CategoryChip({
  value,
  hasError,
  onOpen,
}: {
  value: CategoryId | undefined;
  hasError?: boolean;
  onOpen: () => void;
}) {
  const meta = value ? getCategory(value) : null;
  const Icon = meta?.icon;
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={meta ? `קטגוריה: ${meta.label}. החלף` : "בחר קטגוריה"}
      className={`flex w-full items-center justify-between gap-3 rounded-2xl border bg-surface/60 p-3 text-start transition-colors active:scale-[0.99] ${
        hasError
          ? "border-destructive/60"
          : meta
            ? "border-white/8 hover:border-white/14"
            : "border-[color:var(--neon)]/30 hover:border-[color:var(--neon)]/60"
      }`}
    >
      <span className="flex items-center gap-3">
        {meta && Icon ? (
          <span
            className="flex h-10 w-10 items-center justify-center rounded-xl"
            style={{
              background: `${meta.accent}22`,
              color: meta.accent,
            }}
          >
            <Icon className="h-5 w-5" strokeWidth={1.6} />
          </span>
        ) : (
          <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-dashed border-white/15 text-muted-foreground">
            ?
          </span>
        )}
        <span className="flex flex-col">
          <span className="text-xs text-muted-foreground">קטגוריה</span>
          <span className="text-base font-medium text-foreground">
            {meta?.label ?? "בחר קטגוריה"}
          </span>
        </span>
      </span>
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        {meta ? "החלף" : "בחר"}
        <ChevronLeft className="h-3.5 w-3.5" strokeWidth={2} />
      </span>
    </button>
  );
}
