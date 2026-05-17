"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, Check, Minus, Plus } from "lucide-react";
import { useFinanceStore } from "@/lib/store";
import type { Account } from "@/types/finance";
import { tap } from "@/lib/haptics";

// Plain Intl.NumberFormat (no `signDisplay`). Sign is prepended manually
// further down; that option throws RangeError on iOS Safari < 15.4 when
// constructed at module load.
const ILS_INT = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});
function formatSignedILS(value: number): string {
  if (value === 0) return ILS_INT.format(0);
  const sign = value > 0 ? "+" : "−";
  return `${sign}${ILS_INT.format(Math.abs(value))}`;
}

type Props = { account: Account };

export function AnchorInput({ account }: Props) {
  const setAnchor = useFinanceStore((s) => s.setAnchor);
  const [bumpKey, setBumpKey] = useState(0);
  return (
    <AnchorEditor
      key={`${account.id}-${bumpKey}`}
      account={account}
      onSave={(value) => {
        setAnchor(account.id, value);
        tap();
        setBumpKey((n) => n + 1);
      }}
    />
  );
}

function AnchorEditor({
  account,
  onSave,
}: {
  account: Account;
  onSave: (value: number) => void;
}) {
  // Sign + magnitude tracked separately so iPhone numeric keyboard can stay
  // numeric (no minus key) while a dedicated +/− toggle controls sign.
  const initialBalance = account.anchorBalance ?? 0;
  const [sign, setSign] = useState<1 | -1>(initialBalance < 0 ? -1 : 1);
  const [magnitude, setMagnitude] = useState<string>(() =>
    account.anchorBalance === undefined
      ? ""
      : String(Math.abs(initialBalance)),
  );

  const parsedMag = Number(magnitude.replace(/[^\d.]/g, ""));
  const safeMag = Number.isFinite(parsedMag) ? parsedMag : 0;
  const value = safeMag * sign;
  const dirty = useMemo(
    () =>
      account.anchorBalance === undefined
        ? magnitude.trim().length > 0
        : value !== account.anchorBalance,
    [account.anchorBalance, magnitude, value],
  );

  const overdraft = value < 0;
  const updatedAt = account.anchorUpdatedAt
    ? new Date(account.anchorUpdatedAt).toLocaleString("he-IL", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "מעולם לא עודכן";

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>יתרה נוכחית</span>
        <span data-mono="true" style={{ direction: "ltr" }}>
          עודכן · {updatedAt}
        </span>
      </div>

      {/* Sign-aware composite input. The +/− toggle is large + tap-friendly
          on mobile because numeric keypad on iOS Safari doesn't expose a
          minus key. */}
      <div
        dir="ltr"
        className={`flex items-stretch overflow-hidden rounded-2xl border bg-surface/60 transition-colors ${
          overdraft
            ? "border-[#F87171]/40 shadow-[inset_0_0_0_1px_rgba(248,113,113,0.16)]"
            : "border-white/8"
        }`}
      >
        <button
          type="button"
          onClick={() => setSign((s) => (s === 1 ? -1 : 1))}
          className={`flex w-12 shrink-0 items-center justify-center text-base font-bold transition-colors ${
            sign === -1
              ? "bg-[#F87171]/15 text-[#F87171]"
              : "bg-white/5 text-foreground/70 hover:bg-white/8"
          }`}
          aria-label={sign === -1 ? "שלילי" : "חיובי"}
          title={sign === -1 ? "Negative (overdraft)" : "Positive"}
        >
          {sign === -1 ? <Minus className="size-4" /> : <Plus className="size-4" />}
        </button>
        <span className="flex items-center pl-3 text-sm text-muted-foreground">
          ₪
        </span>
        <input
          type="text"
          inputMode="decimal"
          pattern="[0-9.]*"
          dir="ltr"
          placeholder="0"
          value={magnitude}
          onChange={(e) =>
            setMagnitude(e.target.value.replace(/[^\d.]/g, ""))
          }
          data-mono="true"
          className="h-12 flex-1 bg-transparent px-3 text-xl font-light text-foreground outline-none placeholder:text-muted-foreground/40"
        />
        <motion.button
          type="button"
          disabled={!dirty}
          onClick={() => onSave(value)}
          whileTap={{ scale: 0.94 }}
          className="flex w-12 shrink-0 items-center justify-center bg-[color:var(--neon)]/15 text-[color:var(--neon)] transition-colors hover:bg-[color:var(--neon)]/20 disabled:opacity-30"
          aria-label="שמור"
        >
          <Check className="size-4" />
        </motion.button>
      </div>

      {/* Live preview with proper sign + overdraft visual */}
      {account.anchorBalance !== undefined ? (
        <div className="flex items-center justify-between gap-2">
          <span
            data-mono="true"
            className="text-lg font-light"
            style={{
              direction: "ltr",
              color: account.anchorBalance < 0 ? "#F87171" : "#34D399",
            }}
          >
            {formatSignedILS(account.anchorBalance)}
          </span>
          {account.anchorBalance < 0 ? (
            <span className="flex items-center gap-1 rounded-full border border-[#F87171]/40 bg-[#F87171]/10 px-2 py-0.5 text-[10px] font-medium text-[#F87171]">
              <AlertTriangle className="size-3" strokeWidth={1.8} />
              חריגה
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
