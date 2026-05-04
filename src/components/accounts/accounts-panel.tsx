"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Banknote, CreditCard, Plus, Power, Trash2 } from "lucide-react";

import { useFinanceStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { tap } from "@/lib/haptics";
import type { AccountKind, Issuer } from "@/types/finance";

import { AnchorInput } from "./anchor-input";

type FormState = {
  kind: AccountKind;
  label: string;
  issuer: Issuer;
  cardLast4: string;
  anchorBalance: string;
};

const EMPTY_FORM: FormState = {
  kind: "bank",
  label: "",
  issuer: "cal",
  cardLast4: "",
  anchorBalance: "",
};

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
      anchorBalance:
        form.kind === "bank" && form.anchorBalance.trim()
          ? Number(form.anchorBalance.replace(/,/g, ""))
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
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="mb-1.5 text-xs">מנפיק</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {(["cal", "max"] as const).map((id) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, issuer: id }))}
                        className={`rounded-xl border px-2 py-2 text-xs transition-colors ${
                          form.issuer === id
                            ? "border-neon/60 text-foreground"
                            : "border-border/60 text-muted-foreground"
                        }`}
                      >
                        {id.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <Label htmlFor="acc-last4" className="mb-1.5 text-xs">
                    4 ספרות אחרונות
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
              </div>
            ) : (
              <div>
                <Label htmlFor="acc-anchor" className="mb-1.5 text-xs">
                  יתרה נוכחית (₪) — אפשר שלילי
                </Label>
                <Input
                  id="acc-anchor"
                  type="text"
                  inputMode="numeric"
                  dir="ltr"
                  placeholder="-1000"
                  value={form.anchorBalance}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      anchorBalance: e.target.value.replace(/[^\d.\-]/g, ""),
                    }))
                  }
                />
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
        renderBody={(acc) => (
          <div
            data-mono="true"
            className="text-[11px] text-muted-foreground"
            style={{ direction: "ltr" }}
          >
            {acc.issuer?.toUpperCase()} ····{acc.cardLast4 ?? "—"}
          </div>
        )}
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
                      onClick={() => onToggle(acc.id)}
                      className="flex h-7 items-center gap-1 rounded-md px-2 text-[11px] text-muted-foreground hover:bg-surface hover:text-foreground"
                    >
                      <Power className="size-3" />
                      {acc.active ? "כבה" : "הפעל"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm(`למחוק את "${acc.label}"?`)) {
                          onDelete(acc.id);
                        }
                      }}
                      className="flex h-7 items-center gap-1 rounded-md px-2 text-[11px] text-destructive/80 hover:bg-destructive/10"
                    >
                      <Trash2 className="size-3" />
                    </button>
                  </div>
                </div>
                {renderBody(acc)}
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </div>
  );
}
