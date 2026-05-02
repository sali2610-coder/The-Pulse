"use client";

import { useEffect, useRef, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { AnimatePresence, motion } from "framer-motion";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

import { expenseFormSchema, type ExpenseFormValues } from "@/lib/schema";
import { postExpense } from "@/lib/api";
import { getOrCreateDeviceId } from "@/lib/device-id";
import { success as hapticsSuccess } from "@/lib/haptics";
import { useFinanceStore } from "@/lib/store";
import type { ExpensePayload } from "@/types/expense";

import { AmountInput } from "./amount-input";
import { CategoryGrid } from "./category-grid";
import { InstallmentsInput } from "./installments-input";
import { PaymentMethodToggle } from "./payment-method-toggle";
import { SuccessOverlay } from "./success-overlay";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function ExpenseDialog({ open, onOpenChange }: Props) {
  const [showSuccess, setShowSuccess] = useState(false);
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
      paymentMethod: "credit",
      installments: 1,
      note: "",
    },
  });

  const watchedAmount = useWatch({ control, name: "amount" });

  const mutation = useMutation({
    mutationFn: async (values: ExpenseFormValues) => {
      const result = addExpense({
        amount: values.amount,
        category: values.category,
        note: values.note?.trim() || undefined,
        installments: values.installments,
        paymentMethod: values.paymentMethod,
        source: "manual",
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
    const t = setTimeout(() => amountRef.current?.focus(), 80);
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

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-md gap-0 overflow-y-auto border-border/60 bg-background/95 p-0 backdrop-blur-xl sm:max-w-md">
        <div className="relative">
          <DialogHeader className="px-6 pb-2 pt-6 text-right">
            <DialogTitle className="text-lg font-medium">
              תיעוד הוצאה
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              מזומן, אונליין, או כל הוצאה ידנית. נשמרת מקומית ונשלחת ל־endpoint.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={submit} className="space-y-5 px-6 pb-6">
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
                <CategoryGrid value={field.value} onChange={field.onChange} />
              )}
            />

            <Controller
              control={control}
              name="paymentMethod"
              render={({ field }) => (
                <PaymentMethodToggle
                  value={field.value}
                  onChange={field.onChange}
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

            <Controller
              control={control}
              name="note"
              render={({ field }) => (
                <Textarea
                  placeholder="הערה (לא חובה)"
                  rows={2}
                  maxLength={200}
                  className="resize-none bg-surface/60"
                  value={field.value ?? ""}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                />
              )}
            />

            <Button
              type="submit"
              disabled={!isValid || mutation.isPending}
              className="h-12 w-full rounded-xl bg-neon text-base font-medium text-[#050505] hover:bg-neon/90 disabled:opacity-40"
            >
              {mutation.isPending ? "שומר..." : "שמור הוצאה"}
            </Button>
          </form>

          <SuccessOverlay open={showSuccess} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
