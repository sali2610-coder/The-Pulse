"use client";

// Phase 412 — Bank / Card account Add+Edit fullscreen.
//
// One component, two modes. `kind="bank"` renders the bank form
// (label + anchor balance). `kind="card"` renders the card form
// (label + issuer + last4 + billing/payment day + creditLimit).
// loanId-style remount via key keeps state fresh per row.

import { useState } from "react";
import { CreditCard, Landmark } from "lucide-react";
import { toast } from "sonner";

import {
  FieldRow,
  FullScreenBody,
  FullScreenEditShell,
  FullScreenFieldList,
  FullScreenFooter,
  FullScreenHero,
  FullScreenStepper,
} from "@/components/ui/full-screen-edit-shell";
import { useFinanceStore } from "@/lib/store";
import { success as hapticSuccess } from "@/lib/haptics";
import type { Account, AccountKind, Issuer } from "@/types/finance";

type Props = {
  accountId: string | null;
  /** "bank" when adding from the Bank section, "card" when adding
   *  from the Card section. Ignored when accountId is set (read
   *  from the existing record). */
  defaultKind: AccountKind;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const BANK_TONE = "#34D399";
const CARD_TONE = "#75F5FF";

const ISSUERS: Array<{ id: Issuer; label: string }> = [
  { id: "cal", label: "CAL" },
  { id: "max", label: "MAX" },
  { id: "isracard", label: "Isracard" },
  { id: "amex", label: "Amex" },
  { id: "visa", label: "Visa" },
  { id: "mastercard", label: "Mastercard" },
  { id: "hapoalim", label: "Hapoalim" },
  { id: "leumi", label: "Leumi" },
  { id: "discount", label: "Discount" },
  { id: "mizrahi", label: "Mizrahi" },
  { id: "fibi", label: "FIBI" },
  { id: "other", label: "אחר" },
];

export function AccountFullScreenEdit({
  accountId,
  defaultKind,
  open,
  onOpenChange,
}: Props) {
  const account = useFinanceStore((s) =>
    accountId ? s.accounts.find((a) => a.id === accountId) ?? null : null,
  );
  const kind: AccountKind = account?.kind ?? defaultKind;
  const title =
    accountId
      ? kind === "bank"
        ? "עריכת חשבון בנק"
        : "עריכת כרטיס אשראי"
      : kind === "bank"
        ? "הוספת חשבון בנק"
        : "הוספת כרטיס אשראי";

  return (
    <FullScreenEditShell open={open} onOpenChange={onOpenChange} title={title}>
      <EditBody
        key={accountId ?? `new-${kind}`}
        account={account}
        kind={kind}
        title={title}
        onOpenChange={onOpenChange}
      />
    </FullScreenEditShell>
  );
}

function EditBody({
  account,
  kind,
  title,
  onOpenChange,
}: {
  account: Account | null;
  kind: AccountKind;
  title: string;
  onOpenChange: (open: boolean) => void;
}) {
  const addAccount = useFinanceStore((s) => s.addAccount);
  const updateAccount = useFinanceStore((s) => s.updateAccount);
  const setAnchorInStore = useFinanceStore((s) => s.setAnchor);
  const deleteAccount = useFinanceStore((s) => s.deleteAccount);

  const tone = kind === "bank" ? BANK_TONE : CARD_TONE;
  const Icon = kind === "bank" ? Landmark : CreditCard;

  const [label, setLabel] = useState(account?.label ?? "");
  const [anchor, setAnchorInput] = useState(
    account?.anchorBalance !== undefined
      ? String(account.anchorBalance)
      : "",
  );
  const [issuer, setIssuer] = useState<Issuer>(account?.issuer ?? "cal");
  const [cardLast4, setCardLast4] = useState(account?.cardLast4 ?? "");
  const [billingDay, setBillingDay] = useState<number>(
    account?.billingDay ?? 25,
  );
  const [paymentDay, setPaymentDay] = useState<number>(
    account?.paymentDay ?? 2,
  );
  const [creditLimit, setCreditLimit] = useState(
    account?.creditLimit !== undefined ? String(account.creditLimit) : "",
  );

  const heroAmount = kind === "bank" ? anchor : creditLimit;
  const heroAmountSetter = kind === "bank" ? setAnchorInput : setCreditLimit;
  const heroAmountLabel = kind === "bank" ? "יתרה נוכחית" : "מסגרת";

  const canSave = label.trim().length > 0;

  function handleSave() {
    if (!canSave) return;
    const baseInput = {
      kind,
      label: label.trim(),
    } as const;
    if (account) {
      if (kind === "bank") {
        updateAccount(account.id, {
          ...baseInput,
          anchorBalance: anchor ? Number(anchor) : undefined,
        });
        if (anchor) setAnchorInStore(account.id, Number(anchor));
      } else {
        updateAccount(account.id, {
          ...baseInput,
          issuer,
          cardLast4: cardLast4 || undefined,
          billingDay,
          paymentDay,
          creditLimit: creditLimit ? Number(creditLimit) : undefined,
        });
      }
      toast.success("נשמר");
    } else {
      if (kind === "bank") {
        addAccount({
          ...baseInput,
          anchorBalance: anchor ? Number(anchor) : undefined,
        });
      } else {
        addAccount({
          ...baseInput,
          issuer,
          cardLast4: cardLast4 || undefined,
          billingDay,
          paymentDay,
          creditLimit: creditLimit ? Number(creditLimit) : undefined,
        });
      }
      toast.success(kind === "bank" ? "חשבון בנק נוסף" : "כרטיס נוסף");
    }
    hapticSuccess();
    onOpenChange(false);
  }

  function handleDelete() {
    if (!account) return;
    if (
      typeof window !== "undefined" &&
      !window.confirm(`למחוק את "${account.label}"?`)
    ) {
      return;
    }
    deleteAccount(account.id);
    toast.success("נמחק");
    onOpenChange(false);
  }

  return (
    <>
      <FullScreenBody>
        <FullScreenHero
          icon={Icon}
          tone={tone}
          label={title}
          amount={heroAmount}
          onAmountChange={heroAmountSetter}
          amountLabel={heroAmountLabel}
        />

        <FullScreenFieldList>
          <FieldRow label="שם" stacked>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              maxLength={60}
              placeholder={kind === "bank" ? "דיסקונט / לאומי…" : "Hi-Tech / Bond…"}
              className="w-full rounded-xl border border-white/8 bg-black/25 px-3 py-2 text-end text-[13.5px] text-foreground placeholder:text-muted-foreground/60 focus:border-white/16 focus:outline-none"
            />
          </FieldRow>

          {kind === "card" ? (
            <>
              <FieldRow label="מנפיק" stacked>
                <select
                  value={issuer}
                  onChange={(e) => setIssuer(e.target.value as Issuer)}
                  className="rounded-md border border-white/10 bg-black/30 px-2 py-1 text-end text-[13px] text-foreground focus:border-white/20 focus:outline-none"
                  dir="rtl"
                >
                  {ISSUERS.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </FieldRow>

              <FieldRow label="4 ספרות אחרונות">
                <input
                  type="text"
                  inputMode="numeric"
                  value={cardLast4}
                  onChange={(e) =>
                    setCardLast4(e.target.value.replace(/\D/g, "").slice(-4))
                  }
                  maxLength={4}
                  placeholder="7093"
                  className="w-20 rounded-md border border-white/10 bg-black/30 px-2 py-1 text-end text-[13px] text-foreground placeholder:text-muted-foreground/60 focus:border-white/20 focus:outline-none"
                  dir="ltr"
                />
              </FieldRow>

              <FieldRow label="יום סגירת חיוב (billing)">
                <FullScreenStepper
                  value={billingDay}
                  onChange={setBillingDay}
                  min={1}
                  max={31}
                />
              </FieldRow>

              <FieldRow label="יום חיוב (payment)">
                <FullScreenStepper
                  value={paymentDay}
                  onChange={setPaymentDay}
                  min={1}
                  max={31}
                />
              </FieldRow>
            </>
          ) : null}
        </FullScreenFieldList>
      </FullScreenBody>

      <FullScreenFooter
        primaryLabel={
          account ? "שמור שינויים" : kind === "bank" ? "הוסף חשבון" : "הוסף כרטיס"
        }
        onPrimary={handleSave}
        primaryDisabled={!canSave}
        disabledReason={
          !canSave
            ? label.trim().length === 0
              ? "חסר: שם החשבון"
              : undefined
            : undefined
        }
        cancelLabel="בטל"
        onCancel={() => onOpenChange(false)}
        destructiveLabel={
          account ? (kind === "bank" ? "מחק חשבון" : "מחק כרטיס") : undefined
        }
        onDestructive={account ? handleDelete : undefined}
      />
    </>
  );
}
