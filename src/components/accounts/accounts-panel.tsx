"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Banknote,
  CreditCard,
  Minus,
  Pencil,
  Plus,
  Power,
  Trash2,
} from "lucide-react";

import { useFinanceStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { tap } from "@/lib/haptics";
import type { AccountKind, Issuer } from "@/types/finance";
import { ISSUERS, getIssuerMeta } from "@/lib/card-issuers";

import { AnchorInput } from "./anchor-input";
import { AccountEditSheet } from "./account-edit-sheet";

type FormState = {
  kind: AccountKind;
  label: string;
  issuer: Issuer;
  cardLast4: string;
  billingDay: string;
  paymentDay: string;
  /** Magnitude only (always positive). Sign is `anchorSign`. */
  anchorMag: string;
  anchorSign: 1 | -1;
};

const EMPTY_FORM: FormState = {
  kind: "bank",
  label: "",
  issuer: "cal",
  cardLast4: "",
  billingDay: "",
  paymentDay: "",
  anchorMag: "",
  anchorSign: 1,
};

function parseDayOfMonth(raw: string): number | undefined {
  if (!raw.trim()) return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1 || n > 31) return undefined;
  return Math.floor(n);
}

export function AccountsPanel() {
  const accounts = useFinanceStore((s) => s.accounts);
  const addAccount = useFinanceStore((s) => s.addAccount);
  const toggleAccount = useFinanceStore((s) => s.toggleAccount);
  const deleteAccount = useFinanceStore((s) => s.deleteAccount);

  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  const banks = accounts.filter((a) => a.kind === "bank");
  const cards = accounts.filter((a) => a.kind === "card");

  const submit = () => {
    if (!form.label.trim()) return;
    addAccount({
      kind: form.kind,
      label: form.label,
      issuer: form.kind === "card" ? form.issuer : undefined,
      cardLast4: form.kind === "card" ? form.cardLast4 : undefined,
      billingDay:
        form.kind === "card" ? parseDayOfMonth(form.billingDay) : undefined,
      paymentDay:
        form.kind === "card" ? parseDayOfMonth(form.paymentDay) : undefined,
      color:
        form.kind === "card" ? getIssuerMeta(form.issuer).accent : undefined,
      anchorBalance:
        form.kind === "bank" && form.anchorMag.trim()
          ? Number(form.anchorMag.replace(/[^\d.]/g, "")) * form.anchorSign
          : undefined,
    });
    tap();
    setAdding(false);
    setForm(EMPTY_FORM);
  };

  return (
    <section className="space-y-4">
      <header className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-foreground">חשבונות</div>
          <div className="text-[11px] text-muted-foreground">
            בנקים עם anchor חי + כרטיסים שמשייכים אליהם חיובים אוטומטית
          </div>
        </div>
        {!adding ? (
          <button
            type="button"
            onClick={() => {
              tap();
              setAdding(true);
            }}
            className="flex items-center gap-1.5 rounded-full border border-border/60 bg-background/40 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-neon/50 hover:text-foreground"
          >
            <Plus className="size-3.5 text-neon" />
            חדש
          </button>
        ) : null}
      </header>

      <AnimatePresence>
        {adding ? (
          <motion.form
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
            className="space-y-3 rounded-2xl border border-border/60 bg-surface/60 p-4"
          >
            <div className="grid grid-cols-2 gap-2">
              {(["bank", "card"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, kind: k }))}
                  className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2 text-xs transition-colors ${
                    form.kind === k
                      ? "border-neon/60 bg-background/80 text-foreground"
                      : "border-border/60 bg-background/40 text-muted-foreground"
                  }`}
                >
                  {k === "bank" ? (
                    <Banknote className="size-4" />
                  ) : (
                    <CreditCard className="size-4" />
                  )}
                  {k === "bank" ? "חשבון בנק" : "כרטיס אשראי"}
                </button>
              ))}
            </div>

            <div>
              <Label htmlFor="acc-label" className="mb-1.5 text-xs">
                שם
              </Label>
              <Input
                id="acc-label"
                placeholder={form.kind === "bank" ? "Bank Discount" : 'כאל אישי'}
                value={form.label}
                onChange={(e) =>
                  setForm((f) => ({ ...f, label: e.target.value }))
                }
              />
            </div>

            {form.kind === "card" ? (
              <div className="flex flex-col gap-2">
                <div>
                  <Label className="mb-1.5 text-xs">מנפיק</Label>
                  <select
                    value={form.issuer}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        issuer: e.target.value as Issuer,
                      }))
                    }
                    className="h-9 w-full rounded-xl border border-border/60 bg-background/60 px-2 text-[12px] text-foreground outline-none focus:border-neon/60"
                  >
                    {ISSUERS.map((iss) => (
                      <option key={iss.id} value={iss.id}>
                        {iss.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-1">
                    <Label htmlFor="acc-last4" className="mb-1.5 text-xs">
                      4 ספרות
                    </Label>
                    <Input
                      id="acc-last4"
                      type="text"
                      inputMode="numeric"
                      dir="ltr"
                      maxLength={4}
                      value={form.cardLast4}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          cardLast4: e.target.value.replace(/\D/g, "").slice(0, 4),
                        }))
                      }
                    />
                  </div>
                  <div className="col-span-1">
                    <Label htmlFor="acc-billing" className="mb-1.5 text-xs">
                      יום סגירה
                    </Label>
                    <Input
                      id="acc-billing"
                      type="text"
                      inputMode="numeric"
                      dir="ltr"
                      placeholder="—"
                      value={form.billingDay}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          billingDay: e.target.value.replace(/\D/g, "").slice(0, 2),
                        }))
                      }
                    />
                  </div>
                  <div className="col-span-1">
                    <Label htmlFor="acc-payment" className="mb-1.5 text-xs">
                      יום חיוב
                    </Label>
                    <Input
                      id="acc-payment"
                      type="text"
                      inputMode="numeric"
                      dir="ltr"
                      placeholder="—"
                      value={form.paymentDay}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          paymentDay: e.target.value.replace(/\D/g, "").slice(0, 2),
                        }))
                      }
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div>
                <Label className="mb-1.5 text-xs">
                  יתרה נוכחית (₪) — לחץ על +/− לחשבון בחריגה
                </Label>
                <div
                  dir="ltr"
                  className={`flex items-stretch overflow-hidden rounded-2xl border bg-background/60 transition-colors ${
                    form.anchorSign === -1
                      ? "border-[#F87171]/40"
                      : "border-border/60"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() =>
                      setForm((f) => ({
                        ...f,
                        anchorSign: f.anchorSign === 1 ? -1 : 1,
                      }))
                    }
                    className={`flex w-12 shrink-0 items-center justify-center text-base font-bold transition-colors ${
                      form.anchorSign === -1
                        ? "bg-[#F87171]/15 text-[#F87171]"
                        : "bg-white/5 text-foreground/70 hover:bg-white/8"
                    }`}
                    aria-label={
                      form.anchorSign === -1 ? "שלילי" : "חיובי"
                    }
                  >
                    {form.anchorSign === -1 ? (
                      <Minus className="size-4" />
                    ) : (
                      <Plus className="size-4" />
                    )}
                  </button>
                  <span className="flex items-center pl-3 text-sm text-muted-foreground">
                    ₪
                  </span>
                  <input
                    id="acc-anchor"
                    type="text"
                    inputMode="decimal"
                    pattern="[0-9.]*"
                    dir="ltr"
                    placeholder="0"
                    value={form.anchorMag}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        anchorMag: e.target.value.replace(/[^\d.]/g, ""),
                      }))
                    }
                    data-mono="true"
                    className="h-12 flex-1 bg-transparent px-3 text-base text-foreground outline-none placeholder:text-muted-foreground/40"
                  />
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setAdding(false);
                  setForm(EMPTY_FORM);
                }}
                className="h-9"
              >
                ביטול
              </Button>
              <Button
                type="submit"
                disabled={!form.label.trim()}
                className="h-9 bg-neon text-[#050505] hover:bg-neon/90 disabled:opacity-40"
              >
                הוסף
              </Button>
            </div>
          </motion.form>
        ) : null}
      </AnimatePresence>

      <AccountList
        title="חשבונות בנק"
        kindIcon={<Banknote className="size-4 text-gold" />}
        accounts={banks}
        onToggle={toggleAccount}
        onDelete={deleteAccount}
        renderBody={(acc) => <AnchorInput account={acc} />}
        emptyText="אין חשבונות בנק. הוסף את הראשון כדי לאפשר תחזית EOM מבוססת anchor."
      />

      <AccountList
        title="כרטיסי אשראי"
        kindIcon={<CreditCard className="size-4 text-neon" />}
        accounts={cards}
        onToggle={toggleAccount}
        onDelete={deleteAccount}
        renderBody={(acc) => {
          const meta = getIssuerMeta(acc.issuer);
          return (
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span
                  aria-hidden
                  className="inline-block size-2 rounded-full"
                  style={{ background: acc.color ?? meta.accent }}
                />
                <span
                  data-mono="true"
                  className="text-[11px] text-muted-foreground"
                  style={{ direction: "ltr" }}
                >
                  {meta.label} ····{acc.cardLast4 ?? "—"}
                </span>
              </div>
              {acc.billingDay || acc.paymentDay ? (
                <div
                  className="text-[10px] text-muted-foreground/80"
                  style={{ direction: "ltr" }}
                >
                  {acc.billingDay ? `סגירה ${acc.billingDay}` : null}
                  {acc.billingDay && acc.paymentDay ? " · " : null}
                  {acc.paymentDay ? `חיוב ${acc.paymentDay}` : null}
                </div>
              ) : null}
            </div>
          );
        }}
        emptyText="אין כרטיסים מוגדרים. הוסף כרטיס כדי שחיובים שיוזרמו ישוייכו אוטומטית."
      />
    </section>
  );
}

function AccountList({
  title,
  kindIcon,
  accounts,
  onToggle,
  onDelete,
  renderBody,
  emptyText,
}: {
  title: string;
  kindIcon: React.ReactNode;
  accounts: ReturnType<typeof useFinanceStore.getState>["accounts"];
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  renderBody: (
    a: ReturnType<typeof useFinanceStore.getState>["accounts"][number],
  ) => React.ReactNode;
  emptyText: string;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = accounts.find((a) => a.id === editingId) ?? null;
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
        {kindIcon}
        {title}
      </div>
      {accounts.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border/40 px-3 py-6 text-center text-[11px] text-muted-foreground">
          {emptyText}
        </p>
      ) : (
        <ul className="space-y-2">
          <AnimatePresence initial={false}>
            {accounts.map((acc) => (
              <motion.li
                key={acc.id}
                layout
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: 8 }}
                className={`rounded-2xl border p-3 ${
                  acc.active
                    ? "border-border/60 bg-surface/60"
                    : "border-border/40 bg-surface/30 opacity-60"
                }`}
              >
                <div className="mb-2 flex items-start justify-between gap-2">
                  <span className="text-sm font-medium text-foreground">
                    {acc.label}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setEditingId(acc.id)}
                      className="flex h-8 items-center gap-1 rounded-md px-2.5 text-[12px] text-muted-foreground hover:bg-surface hover:text-foreground"
                      aria-label={`ערוך ${acc.label}`}
                    >
                      <Pencil className="size-3.5" />
                      ערוך
                    </button>
                    <button
                      type="button"
                      onClick={() => onToggle(acc.id)}
                      className="flex h-8 items-center gap-1 rounded-md px-2 text-[12px] text-muted-foreground hover:bg-surface hover:text-foreground"
                    >
                      <Power className="size-3.5" />
                      {acc.active ? "כבה" : "הפעל"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm(`למחוק את "${acc.label}"?`)) {
                          onDelete(acc.id);
                        }
                      }}
                      className="flex h-8 items-center gap-1 rounded-md px-2 text-[12px] text-destructive/80 hover:bg-destructive/10"
                      aria-label={`מחק ${acc.label}`}
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </div>
                {renderBody(acc)}
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
      <AccountEditSheet
        account={editing}
        open={editingId !== null}
        onOpenChange={(o) => {
          if (!o) setEditingId(null);
        }}
      />
    </div>
  );
}
