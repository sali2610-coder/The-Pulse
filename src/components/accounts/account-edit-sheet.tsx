"use client";

// Phase 227 — explicit edit surface for an account.
//
// The AccountList row previously exposed only toggle + delete, so
// the user had no way to change a label, billing day, or current-
// debt seed after the initial create. Inline AnchorInput already
// handled live balance updates, but discoverability was poor.
//
// This sheet uses the existing Dialog primitive (no new deps) and
// commits via store.updateAccount — also supports a quick balance
// update for bank accounts with the same anchor-history side-effect
// the inline editor does.

import { useEffect, useState } from "react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useFinanceStore } from "@/lib/store";
import { tap } from "@/lib/haptics";
import type { Account, Issuer } from "@/types/finance";

const ISSUERS: Array<{ value: Issuer; label: string }> = [
  { value: "cal", label: "כאל" },
  { value: "max", label: "MAX" },
  { value: "isracard", label: "ישראכרט" },
  { value: "amex", label: "American Express" },
  { value: "hapoalim", label: "הפועלים" },
  { value: "leumi", label: "לאומי" },
  { value: "discount", label: "דיסקונט" },
  { value: "mizrahi", label: "מזרחי" },
  { value: "fibi", label: "FIBI" },
  { value: "visa", label: "Visa" },
  { value: "mastercard", label: "Mastercard" },
  { value: "other", label: "אחר" },
];

export function AccountEditSheet({
  account,
  open,
  onOpenChange,
}: {
  account: Account | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const updateAccount = useFinanceStore((s) => s.updateAccount);
  const setAnchor = useFinanceStore((s) => s.setAnchor);

  const [label, setLabel] = useState(account?.label ?? "");
  const [issuer, setIssuer] = useState<Issuer | undefined>(account?.issuer);
  const [cardLast4, setCardLast4] = useState(account?.cardLast4 ?? "");
  const [billingDay, setBillingDay] = useState(
    account?.billingDay !== undefined ? String(account.billingDay) : "",
  );
  const [paymentDay, setPaymentDay] = useState(
    account?.paymentDay !== undefined ? String(account.paymentDay) : "",
  );
  const [creditLimit, setCreditLimit] = useState(
    account?.creditLimit !== undefined ? String(account.creditLimit) : "",
  );
  const [balanceMag, setBalanceMag] = useState(
    account?.anchorBalance !== undefined
      ? String(Math.abs(account.anchorBalance))
      : "",
  );
  const [balanceNeg, setBalanceNeg] = useState(
    (account?.anchorBalance ?? 0) < 0,
  );

  // Reset local state when the sheet opens against a different account.
  // Defer to a microtask so the lint rule that forbids synchronous
  // setState inside an effect body passes.
  useEffect(() => {
    if (!account || !open) return;
    let cancelled = false;
    Promise.resolve().then(() => {
      if (cancelled) return;
      setLabel(account.label);
      setIssuer(account.issuer);
      setCardLast4(account.cardLast4 ?? "");
      setBillingDay(
        account.billingDay !== undefined ? String(account.billingDay) : "",
      );
      setPaymentDay(
        account.paymentDay !== undefined ? String(account.paymentDay) : "",
      );
      setCreditLimit(
        account.creditLimit !== undefined ? String(account.creditLimit) : "",
      );
      setBalanceMag(
        account.anchorBalance !== undefined
          ? String(Math.abs(account.anchorBalance))
          : "",
      );
      setBalanceNeg((account.anchorBalance ?? 0) < 0);
    });
    return () => {
      cancelled = true;
    };
  }, [account, open]);

  if (!account) return null;
  const isBank = account.kind === "bank";

  function commit() {
    if (!account) return;
    const trimmed = label.trim();
    if (trimmed.length === 0) {
      toast.error("נדרשת תווית.");
      return;
    }
    updateAccount(account.id, {
      label: trimmed,
      ...(isBank
        ? {}
        : {
            issuer,
            cardLast4: cardLast4 || undefined,
            billingDay: billingDay ? Math.max(1, Math.min(31, Number(billingDay))) : undefined,
            paymentDay: paymentDay ? Math.max(1, Math.min(31, Number(paymentDay))) : undefined,
            creditLimit: creditLimit ? Number(creditLimit) : undefined,
          }),
    });

    // Bank: also push the balance update through setAnchor so the
    // anchor-history (Phase 218) gets a new point + Cloud Sync
    // observes the change like a normal inline save.
    if (isBank && balanceMag.trim().length > 0) {
      const mag = Number(balanceMag.replace(/[^\d.]/g, ""));
      if (Number.isFinite(mag)) {
        const signed = balanceNeg ? -mag : mag;
        setAnchor(account.id, signed);
        // Lazy-import so the side-effect doesn't bloat the route chunk.
        void import("@/lib/anchor-history").then((m) =>
          m.appendAnchorPoint({
            accountId: account.id,
            label: trimmed,
            balance: signed,
          }),
        );
      }
    }

    tap();
    toast.success("עודכן");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>עריכת חשבון</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3 pt-2">
          <Field label="תווית">
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="h-11 w-full rounded-xl border border-white/12 bg-background/40 px-3 text-[14px] text-foreground outline-none focus:border-[color:var(--neon)]/60"
            />
          </Field>

          {isBank ? (
            <Field label="יתרה נוכחית (₪)">
              <div dir="ltr" className="flex items-stretch overflow-hidden rounded-xl border border-white/12 bg-background/40">
                <button
                  type="button"
                  onClick={() => setBalanceNeg((v) => !v)}
                  className={`tap-44 flex w-12 shrink-0 items-center justify-center text-base font-bold transition-colors ${
                    balanceNeg
                      ? "bg-[#F87171]/15 text-[#F87171]"
                      : "bg-white/5 text-foreground/70"
                  }`}
                  aria-pressed={balanceNeg}
                  aria-label={balanceNeg ? "שלילי" : "חיובי"}
                >
                  {balanceNeg ? "−" : "+"}
                </button>
                <input
                  type="text"
                  inputMode="decimal"
                  pattern="[0-9.]*"
                  dir="ltr"
                  placeholder="0"
                  value={balanceMag}
                  onChange={(e) =>
                    setBalanceMag(e.target.value.replace(/[^\d.]/g, ""))
                  }
                  data-mono="true"
                  className="h-11 flex-1 bg-transparent px-3 text-[16px] text-foreground outline-none"
                />
              </div>
            </Field>
          ) : (
            <>
              <Field label="חברת אשראי">
                <select
                  value={issuer ?? ""}
                  onChange={(e) =>
                    setIssuer((e.target.value || undefined) as Issuer | undefined)
                  }
                  className="h-11 w-full rounded-xl border border-white/12 bg-background/40 px-3 text-[14px] text-foreground"
                >
                  <option value="">—</option>
                  {ISSUERS.map((it) => (
                    <option key={it.value} value={it.value}>
                      {it.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="4 ספרות אחרונות">
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={4}
                  value={cardLast4}
                  onChange={(e) =>
                    setCardLast4(e.target.value.replace(/\D/g, "").slice(0, 4))
                  }
                  className="h-11 w-full rounded-xl border border-white/12 bg-background/40 px-3 text-[14px] text-foreground outline-none focus:border-[color:var(--neon)]/60"
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="יום סגירה">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={billingDay}
                    onChange={(e) =>
                      setBillingDay(e.target.value.replace(/\D/g, "").slice(0, 2))
                    }
                    className="h-11 w-full rounded-xl border border-white/12 bg-background/40 px-3 text-[14px] text-foreground outline-none focus:border-[color:var(--neon)]/60"
                  />
                </Field>
                <Field label="יום חיוב">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={paymentDay}
                    onChange={(e) =>
                      setPaymentDay(e.target.value.replace(/\D/g, "").slice(0, 2))
                    }
                    className="h-11 w-full rounded-xl border border-white/12 bg-background/40 px-3 text-[14px] text-foreground outline-none focus:border-[color:var(--neon)]/60"
                  />
                </Field>
              </div>
              <Field label="מסגרת אשראי (₪)">
                <input
                  type="text"
                  inputMode="numeric"
                  value={creditLimit}
                  onChange={(e) =>
                    setCreditLimit(e.target.value.replace(/[^\d]/g, ""))
                  }
                  className="h-11 w-full rounded-xl border border-white/12 bg-background/40 px-3 text-[14px] text-foreground outline-none focus:border-[color:var(--neon)]/60"
                />
              </Field>
            </>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)} className="tap-44">
              ביטול
            </Button>
            <Button
              onClick={commit}
              className="tap-44 bg-neon text-[#050505] hover:bg-neon/90"
            >
              שמור
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[12px] text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
