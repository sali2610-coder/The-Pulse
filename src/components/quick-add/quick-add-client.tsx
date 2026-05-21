"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  ArrowDownToLine,
  ArrowUpRight,
  Check,
  Minus,
  Plus,
} from "lucide-react";
import { toast } from "sonner";

import { GlassPopup } from "@/components/ui/glass-popup";
import { CategoryPickerSheet } from "@/components/confirmation/category-picker-sheet";
import { useFinanceStore } from "@/lib/store";
import {
  CATEGORY_IDS,
  getCategory,
  type CategoryId,
} from "@/lib/categories";
import { categorize } from "@/lib/parsers";
import { success, tap } from "@/lib/haptics";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 2,
});

type Direction = "expense" | "income";

type Props = {
  initialType: Direction;
  initialCategory?: string;
  initialAmount?: string;
};

function parseInitialAmount(raw: string | undefined): string {
  if (!raw) return "";
  const cleaned = raw.replace(/[^\d.]/g, "");
  return cleaned;
}

function pickInitialCategory(raw: string | undefined): CategoryId {
  if (!raw) return "other";
  const value = raw.toLowerCase();
  return (CATEGORY_IDS as readonly string[]).includes(value)
    ? (value as CategoryId)
    : "other";
}

/**
 * Floating compact glass capture overlay. Mounted directly under the
 * /quick-add route — no AppShell, no dashboard widgets, no analytics
 * panels. Reuses `addExpense` / `addIncome` from the existing
 * Zustand store; no new store, no new business logic.
 *
 * Success path: store action → success haptic → toast → router.replace("/")
 * so the user lands back on the dashboard with the new entry already
 * reflected in every live calculation.
 */
export function QuickAddClient({
  initialType,
  initialCategory,
  initialAmount,
}: Props) {
  const router = useRouter();
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const addExpense = useFinanceStore((s) => s.addExpense);
  const addIncome = useFinanceStore((s) => s.addIncome);

  const [direction, setDirection] = useState<Direction>(initialType);
  const [amount, setAmount] = useState<string>(
    parseInitialAmount(initialAmount),
  );
  const [merchant, setMerchant] = useState<string>("");
  const [category, setCategory] = useState<CategoryId>(
    pickInitialCategory(initialCategory),
  );
  const [installments, setInstallments] = useState<number>(1);
  const [note, setNote] = useState<string>("");
  const [pickerOpen, setPickerOpen] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);

  const amountInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    // Pop the keyboard immediately on iPhone PWA so the user can
    // start typing without a tap. Bail if the browser refuses
    // (Safari occasionally rejects autofocus from non-user gestures).
    const t = setTimeout(() => {
      amountInputRef.current?.focus({ preventScroll: true });
    }, 80);
    return () => clearTimeout(t);
  }, []);

  const parsedAmount = Number(amount);
  const meta = getCategory(category);
  const ready = Number.isFinite(parsedAmount) && parsedAmount > 0;
  const isIncome = direction === "income";

  function close(replace = true) {
    if (replace) router.replace("/");
    else router.back();
  }

  function handleSave() {
    if (!ready || saving) return;
    setSaving(true);
    tap();
    try {
      if (isIncome) {
        const dayOfMonth = new Date().getDate();
        addIncome({
          label: merchant.trim() || "הכנסה",
          amount: parsedAmount,
          dayOfMonth,
        });
        success();
        toast.success("הכנסה נוספה", {
          description: ILS.format(parsedAmount),
        });
      } else {
        addExpense({
          amount: parsedAmount,
          category,
          note: note.trim() || undefined,
          source: "manual",
          paymentMethod: "credit",
          installments: Math.max(1, Math.floor(installments)),
          merchant: merchant.trim() || undefined,
        });
        success();
        toast.success("הוצאה נרשמה", {
          description: merchant.trim() || meta.label,
        });
      }
      close();
    } finally {
      setSaving(false);
    }
  }

  // Auto-suggest category as the user types a merchant name.
  function applyMerchantChange(next: string) {
    setMerchant(next);
    if (category !== "other") return;
    const trimmed = next.trim();
    if (!trimmed) return;
    const guess = categorize(trimmed) as CategoryId;
    if (guess && guess !== "other") setCategory(guess);
  }

  if (!hydrated) {
    return (
      <main className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md">
        <span className="size-6 animate-pulse rounded-full bg-neon/40" />
      </main>
    );
  }

  return (
    <>
      <GlassPopup
        open
        onOpenChange={(o) => {
          if (!o) close();
        }}
        title="תיעוד מהיר"
      >
        {/* Direction toggle — expense (default) vs income */}
        <div
          className="flex items-center gap-1 rounded-full border border-white/8 bg-black/30 p-0.5"
          dir="ltr"
        >
          {(["expense", "income"] as const).map((kind) => {
            const active = direction === kind;
            return (
              <button
                key={kind}
                type="button"
                onClick={() => {
                  tap();
                  setDirection(kind);
                }}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] transition-colors ${
                  active
                    ? kind === "expense"
                      ? "bg-[#F87171]/15 text-[#F87171]"
                      : "bg-[#34D399]/15 text-[#34D399]"
                    : "text-muted-foreground"
                }`}
              >
                {kind === "expense" ? (
                  <ArrowUpRight className="size-3" />
                ) : (
                  <ArrowDownToLine className="size-3" />
                )}
                {kind === "expense" ? "הוצאה" : "הכנסה"}
              </button>
            );
          })}
        </div>

        {/* Amount — primary focus */}
        <div
          className="flex items-baseline justify-center gap-1 pt-1"
          dir="ltr"
        >
          <input
            ref={amountInputRef}
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
            placeholder="0"
            className="w-40 bg-transparent text-center font-mono text-[34px] font-light leading-none tracking-tight text-foreground outline-none ring-0 placeholder:text-muted-foreground/40"
          />
          <span className="text-[18px] text-muted-foreground">₪</span>
        </div>

        {/* Merchant / title */}
        <input
          value={merchant}
          onChange={(e) => applyMerchantChange(e.target.value)}
          placeholder={isIncome ? "מקור ההכנסה" : "שם בית עסק"}
          className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-center text-[13px] text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-[color:var(--neon)]"
        />

        {/* Category + installments — expense only */}
        {!isIncome ? (
          <div className="flex items-center gap-2">
            <motion.button
              type="button"
              whileTap={{ scale: 0.97 }}
              onClick={() => {
                tap();
                setPickerOpen(true);
              }}
              className="flex flex-1 items-center justify-between gap-2 rounded-xl border border-white/10 bg-black/30 px-2.5 py-2 text-start"
            >
              <span className="flex items-center gap-2">
                <span
                  className="flex h-7 w-7 items-center justify-center rounded-lg"
                  style={{
                    background: `${meta.accent}22`,
                    color: meta.accent,
                  }}
                >
                  <meta.icon className="h-3.5 w-3.5" strokeWidth={1.6} />
                </span>
                <span className="text-[12px] font-medium text-foreground">
                  {meta.label}
                </span>
              </span>
              <span className="text-[9px] text-muted-foreground">החלף</span>
            </motion.button>

            <div
              className="flex shrink-0 items-center gap-1 rounded-xl border border-white/10 bg-black/30 px-1.5 py-1"
              dir="ltr"
            >
              <button
                type="button"
                aria-label="פחות תשלום"
                onClick={() => {
                  tap();
                  setInstallments((v) => Math.max(1, v - 1));
                }}
                className="flex size-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-white/8"
              >
                <Minus className="size-3.5" />
              </button>
              <span
                data-mono="true"
                className="w-5 text-center text-[12px] font-medium text-foreground"
              >
                {installments}
              </span>
              <button
                type="button"
                aria-label="עוד תשלום"
                onClick={() => {
                  tap();
                  setInstallments((v) => Math.min(60, v + 1));
                }}
                className="flex size-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-white/8"
              >
                <Plus className="size-3.5" />
              </button>
            </div>
          </div>
        ) : null}

        {/* Optional note */}
        {!isIncome ? (
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="הערה (אופציונלי)"
            className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-1.5 text-center text-[11.5px] text-muted-foreground outline-none placeholder:text-muted-foreground/50 focus:border-[color:var(--neon)] focus:text-foreground"
          />
        ) : null}

        {/* Actions */}
        <div className="flex items-center gap-1.5 pt-0.5">
          <button
            type="button"
            onClick={handleSave}
            disabled={!ready || saving}
            className="btn-confirm flex h-10 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-xl text-[13px] font-semibold transition-transform active:scale-[0.99] disabled:opacity-50"
          >
            <Check className="h-4 w-4" strokeWidth={2.4} />
            שמור{isIncome ? " הכנסה" : " הוצאה"}
          </button>
          <button
            type="button"
            onClick={() => {
              tap();
              close();
            }}
            className="flex h-10 w-16 shrink-0 items-center justify-center rounded-xl border border-white/12 bg-black/30 text-[12px] text-muted-foreground transition-colors hover:border-white/20 hover:text-foreground"
          >
            ביטול
          </button>
        </div>
      </GlassPopup>

      <CategoryPickerSheet
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        selected={category}
        suggested={(() => {
          if (!merchant.trim()) return undefined;
          const hint = categorize(merchant.trim()) as CategoryId;
          return hint !== "other" ? hint : undefined;
        })()}
        onSelect={(id) => setCategory(id)}
      />
    </>
  );
}
