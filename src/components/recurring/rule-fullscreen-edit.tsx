"use client";

// Phase 413 — Recurring rule Add+Edit fullscreen.
// One component handles regular bills, subscriptions, installment
// plans, and credit-card obligations. The active paymentSource may
// be locked when opened from a specific section so the user can't
// flip a "subscription" into a "bank standing order" by mistake.

import { useMemo, useState } from "react";
import { Receipt } from "lucide-react";
import { toast } from "sonner";

import {
  FieldRow,
  FullScreenBody,
  FullScreenChipRow,
  FullScreenEditShell,
  FullScreenFieldList,
  FullScreenFooter,
  FullScreenHero,
  FullScreenSegmented,
  FullScreenStepper,
} from "@/components/ui/full-screen-edit-shell";
import { useFinanceStore } from "@/lib/store";
import { CATEGORIES, getCategory, type CategoryId } from "@/lib/categories";
import { success as hapticSuccess } from "@/lib/haptics";
import type { RecurringRule } from "@/types/finance";

type Mode = "regular" | "installment";
type PaymentSource = "bank" | "card" | "cash" | "unknown";

type Props = {
  ruleId: string | null;
  /** Optional lock — e.g. when opening from the "subscription"
   *  variant of the recurring mini-app. */
  lockedPaymentSource?: PaymentSource;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function RuleFullScreenEdit({
  ruleId,
  lockedPaymentSource,
  open,
  onOpenChange,
}: Props) {
  const rule = useFinanceStore((s) =>
    ruleId ? s.rules.find((r) => r.id === ruleId) ?? null : null,
  );
  const title = ruleId ? "עריכת חיוב קבוע" : "הוספת חיוב קבוע";
  return (
    <FullScreenEditShell open={open} onOpenChange={onOpenChange} title={title}>
      <EditBody
        key={ruleId ?? "new"}
        rule={rule}
        title={title}
        lockedPaymentSource={lockedPaymentSource}
        onOpenChange={onOpenChange}
      />
    </FullScreenEditShell>
  );
}

function EditBody({
  rule,
  title,
  lockedPaymentSource,
  onOpenChange,
}: {
  rule: RecurringRule | null;
  title: string;
  lockedPaymentSource?: PaymentSource;
  onOpenChange: (open: boolean) => void;
}) {
  const addRule = useFinanceStore((s) => s.addRule);
  const updateRule = useFinanceStore((s) => s.updateRule);
  const deleteRule = useFinanceStore((s) => s.deleteRule);
  const accounts = useFinanceStore((s) => s.accounts);
  const activeCards = useMemo(
    () => accounts.filter((a) => a.kind === "card" && a.active),
    [accounts],
  );

  const now = useMemo(() => new Date(), []);
  const [label, setLabel] = useState(rule?.label ?? "");
  const [amount, setAmount] = useState(
    rule ? String(rule.estimatedAmount ?? 0) : "",
  );
  const [category, setCategory] = useState<CategoryId>(
    (rule?.category ?? "bills") as CategoryId,
  );
  const [dayOfMonth, setDayOfMonth] = useState<number>(rule?.dayOfMonth ?? 1);
  const [keywords, setKeywords] = useState(
    rule?.keywords?.join(", ") ?? "",
  );

  const initialMode: Mode = rule?.installmentTotal ? "installment" : "regular";
  const [mode, setMode] = useState<Mode>(initialMode);
  const [installmentTotal, setInstallmentTotal] = useState<number>(
    rule?.installmentTotal ?? 12,
  );
  const [startMonth, setStartMonth] = useState<number>(
    rule?.startMonth ?? now.getMonth() + 1,
  );
  const [startYear, setStartYear] = useState<number>(
    rule?.startYear ?? now.getFullYear(),
  );

  const [paymentSource, setPaymentSource] = useState<PaymentSource>(
    lockedPaymentSource ?? rule?.paymentSource ?? "unknown",
  );
  const [linkedCardId, setLinkedCardId] = useState<string | undefined>(
    rule?.linkedCardId,
  );
  const [variable, setVariable] = useState<boolean>(rule?.variable ?? false);

  const meta = getCategory(category);
  const amountNumber = Number(amount || 0);
  // Variable rules ("סכום משתנה") legitimately carry an estimate of 0
  // — the user isn't sure yet. Don't block the save on it.
  const amountRequired = !(mode === "regular" && variable);
  const canSave =
    label.trim().length > 0 &&
    dayOfMonth >= 1 &&
    (!amountRequired || amountNumber > 0);

  function handleSave() {
    if (!canSave) return;
    const payload = {
      label: label.trim(),
      category,
      estimatedAmount: amountNumber,
      dayOfMonth,
      keywords: keywords
        .split(",")
        .map((k) => k.trim())
        .filter((k) => k.length > 0),
      paymentSource,
      linkedCardId: paymentSource === "card" ? linkedCardId : undefined,
      installmentTotal:
        mode === "installment" ? installmentTotal : undefined,
      startMonth: mode === "installment" ? startMonth : undefined,
      startYear: mode === "installment" ? startYear : undefined,
      variable: mode === "regular" ? variable : false,
    };
    if (rule) {
      updateRule(rule.id, payload);
      toast.success("החיוב הקבוע עודכן");
    } else {
      addRule(payload);
      toast.success("חיוב קבוע נוסף");
    }
    hapticSuccess();
    onOpenChange(false);
  }

  function handleDelete() {
    if (!rule) return;
    if (
      typeof window !== "undefined" &&
      !window.confirm(`למחוק את "${rule.label}"?`)
    ) {
      return;
    }
    deleteRule(rule.id);
    toast.success("החיוב נמחק");
    onOpenChange(false);
  }

  return (
    <>
      <FullScreenBody>
        <FullScreenHero
          icon={meta.icon}
          tone={meta.accent}
          label={title}
          amount={amount}
          onAmountChange={setAmount}
          amountLabel={mode === "installment" ? "תשלום חודשי" : "סכום צפוי"}
        />

        <FullScreenFieldList>
          <FieldRow label="שם" stacked>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              maxLength={80}
              placeholder="שכירות / נטפליקס / ועד בית…"
              className="w-full rounded-xl border border-white/8 bg-black/25 px-3 py-2 text-end text-[13.5px] text-foreground placeholder:text-muted-foreground/60 focus:border-white/16 focus:outline-none"
            />
          </FieldRow>

          <FieldRow label="סוג">
            <FullScreenSegmented<Mode>
              options={[
                { id: "regular", label: "חוזר" },
                { id: "installment", label: "תשלומים" },
              ]}
              value={mode}
              onChange={setMode}
              layoutId="rule-mode"
            />
          </FieldRow>

          <FieldRow label="קטגוריה" stacked>
            <FullScreenChipRow
              options={CATEGORIES.map((c) => ({
                id: c.id as CategoryId,
                label: c.label,
              }))}
              value={category}
              onChange={(id) => setCategory(id as CategoryId)}
            />
          </FieldRow>

          <FieldRow label="יום החיוב">
            <FullScreenStepper
              value={dayOfMonth}
              onChange={setDayOfMonth}
              min={1}
              max={31}
            />
          </FieldRow>

          {mode === "installment" ? (
            <>
              <FieldRow label="כמה תשלומים">
                <FullScreenStepper
                  value={installmentTotal}
                  onChange={setInstallmentTotal}
                  min={1}
                  max={360}
                />
              </FieldRow>
              <FieldRow label="חודש התחלה">
                <FullScreenStepper
                  value={startMonth}
                  onChange={setStartMonth}
                  min={1}
                  max={12}
                />
              </FieldRow>
              <FieldRow label="שנת התחלה">
                <input
                  type="number"
                  value={startYear}
                  onChange={(e) => setStartYear(Number(e.target.value))}
                  min={2000}
                  max={2100}
                  className="w-20 rounded-md border border-white/10 bg-black/30 px-2 py-1 text-end text-[13px] text-foreground focus:border-white/20 focus:outline-none"
                  dir="ltr"
                />
              </FieldRow>
            </>
          ) : (
            <FieldRow label="סכום משתנה?">
              <FullScreenSegmented<"fixed" | "variable">
                options={[
                  { id: "fixed", label: "קבוע" },
                  { id: "variable", label: "משתנה" },
                ]}
                value={variable ? "variable" : "fixed"}
                onChange={(v) => setVariable(v === "variable")}
                layoutId="rule-variable"
              />
            </FieldRow>
          )}

          <FieldRow label="מקור תשלום">
            <FullScreenSegmented<PaymentSource>
              options={[
                { id: "bank", label: "בנק" },
                { id: "card", label: "כרטיס" },
                { id: "cash", label: "מזומן" },
              ]}
              value={paymentSource === "unknown" ? "bank" : paymentSource}
              onChange={(v) => {
                if (lockedPaymentSource) return;
                setPaymentSource(v);
                if (v !== "card") setLinkedCardId(undefined);
              }}
              layoutId="rule-payment-source"
            />
          </FieldRow>

          {paymentSource === "card" && activeCards.length > 0 ? (
            <FieldRow label="כרטיס" stacked>
              <FullScreenChipRow
                options={activeCards.map((c) => ({
                  id: c.id,
                  label: c.label,
                  sublabel: c.cardLast4 ? `····${c.cardLast4}` : undefined,
                }))}
                value={linkedCardId}
                onChange={(id) => setLinkedCardId(id)}
              />
            </FieldRow>
          ) : null}

          <FieldRow label="מילות מפתח (לזיהוי)" stacked>
            <input
              type="text"
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              placeholder="netflix, נטפליקס"
              className="w-full rounded-xl border border-white/8 bg-black/25 px-3 py-2 text-end text-[13px] text-foreground placeholder:text-muted-foreground/60 focus:border-white/16 focus:outline-none"
            />
          </FieldRow>
        </FullScreenFieldList>
      </FullScreenBody>

      <FullScreenFooter
        primaryLabel={rule ? "שמור שינויים" : "הוסף חיוב קבוע"}
        onPrimary={handleSave}
        primaryDisabled={!canSave}
        destructiveLabel={rule ? "מחק חיוב" : undefined}
        onDestructive={rule ? handleDelete : undefined}
      />
      {/* meta retained for typecheck */}
      <span className="hidden">{meta.label}</span>
      <Receipt className="hidden" aria-hidden />
    </>
  );
}
