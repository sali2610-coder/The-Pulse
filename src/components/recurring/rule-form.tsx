"use client";

import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { motion } from "framer-motion";

import {
  recurringRuleFormSchema,
  type RecurringRuleFormValues,
} from "@/lib/schema";
import { CATEGORIES } from "@/lib/categories";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import type { RecurringRule } from "@/types/finance";

type SubmitInput = {
  label: string;
  category: RecurringRuleFormValues["category"];
  estimatedAmount: number;
  dayOfMonth: number;
  keywords: string[];
};

type Props = {
  initial?: RecurringRule;
  submitLabel: string;
  onSubmit: (values: SubmitInput) => void;
  onCancel?: () => void;
};

export function RuleForm({ initial, submitLabel, onSubmit, onCancel }: Props) {
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
    },
  });

  const submit = handleSubmit((values) => {
    onSubmit({
      label: values.label,
      category: values.category,
      estimatedAmount: values.estimatedAmount,
      dayOfMonth: values.dayOfMonth,
      keywords: (values.keywords ?? "")
        .split(",")
        .map((k) => k.trim())
        .filter((k) => k.length > 0),
    });
  });

  return (
    <motion.form
      onSubmit={submit}
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4 rounded-2xl border border-border/60 bg-surface/60 p-4"
    >
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <Label htmlFor="rule-label" className="mb-1.5 text-xs">
            שם ההוצאה
          </Label>
          <Controller
            control={control}
            name="label"
            render={({ field }) => (
              <Input
                id="rule-label"
                placeholder='לדוגמה: "חשמל"'
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
            סכום צפוי (₪)
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
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => field.onChange(c.id)}
                    className={`flex items-center justify-center gap-2 rounded-xl border px-2 py-2 text-xs transition-colors ${
                      selected
                        ? "border-neon/70 text-foreground"
                        : "border-border/60 text-muted-foreground hover:border-border"
                    }`}
                  >
                    <Icon
                      className="size-4"
                      style={{ color: selected ? c.accent : undefined }}
                    />
                    {c.label}
                  </button>
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

      <div>
        <Label htmlFor="rule-keywords" className="mb-1.5 text-xs">
          מילות מפתח (לשידוך, מופרדות בפסיק)
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
