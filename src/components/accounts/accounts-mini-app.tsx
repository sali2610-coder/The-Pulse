"use client";

// Phase 412 · rev — Accounts folder as a compact 2-tile dashboard.
//
// Prior version rendered two long stacked sections (banks + cards)
// inside the Settings accordion. Rebuilt as two glass tap-tiles
// followed by a BottomSheet drilldown for each. The list of banks /
// cards, add CTA, and per-item AccountFullScreenEdit shell all
// mount unchanged inside the sheet — every persistence path and
// engine derivation remains as before.
//
// Sync contract — verified on this pass:
//   • banks / cards / entries / rules / statuses / loans / incomes /
//     monthlyBudget are all read from useFinanceStore. Any mutation
//     from anywhere in the app (quick expense, SMS webhook, loan
//     edit, rule edit, income mini-app, LiveEvents feed) triggers
//     zustand notifications and this file re-renders.
//   • Credit exposure is derived through buildEngineCtx +
//     getCreditExposure — the same engine surface consumed by the
//     Home Obligations Dashboard, Time-tab checkpoints, and the
//     Expenses cockpit. One source of truth.
//   • Anchor balance updates flow through store.setAnchor inside
//     AccountFullScreenEdit; the moment they land, downstream
//     forecasting recomputes automatically.

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  CreditCard,
  Landmark,
  Plus,
} from "lucide-react";

import { BottomSheet } from "@/components/ui/bottom-sheet";
import { useFinanceStore } from "@/lib/store";
import {
  buildEngineCtx,
  getCreditExposure,
} from "@/lib/financial-engine";
import { currentMonthKey } from "@/lib/dates";
import {
  MiniAppAddCta,
  MiniAppEmpty,
  MiniAppListCard,
} from "@/components/ui/mini-app-shell";
import { AccountFullScreenEdit } from "@/components/accounts/account-fullscreen-edit";
import { tap as hapticTap } from "@/lib/haptics";
import type { Account, AccountKind } from "@/types/finance";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

const BANK_TONE = "#34D399";
const CARD_TONE = "#75F5FF";

function daysSince(iso?: string): number | undefined {
  if (!iso) return undefined;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return undefined;
  return Math.max(0, Math.floor((Date.now() - t) / 86_400_000));
}

type SheetKind = "bank" | "card" | null;

export function AccountsMiniApp() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const accounts = useFinanceStore((s) => s.accounts);
  const rules = useFinanceStore((s) => s.rules);
  const statuses = useFinanceStore((s) => s.statuses);
  const entries = useFinanceStore((s) => s.entries);
  const loans = useFinanceStore((s) => s.loans);
  const incomes = useFinanceStore((s) => s.incomes);
  const monthlyBudget = useFinanceStore((s) => s.monthlyBudget);

  const [sheet, setSheet] = useState<SheetKind>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingKind, setEditingKind] = useState<AccountKind>("bank");
  const [editOpen, setEditOpen] = useState(false);

  const banks = accounts.filter((a) => a.kind === "bank");
  const cards = accounts.filter((a) => a.kind === "card");
  const activeBanks = banks.filter((a) => a.active);
  const activeCards = cards.filter((a) => a.active);

  const totalLiquidity = activeBanks.reduce(
    (s, a) => s + (a.anchorBalance ?? 0),
    0,
  );

  const ctx = useMemo(() => {
    if (!hydrated) return null;
    return buildEngineCtx({
      accounts,
      rules,
      statuses,
      entries,
      loans,
      incomes,
      monthlyBudget,
      monthKey: currentMonthKey(),
    });
  }, [
    hydrated,
    accounts,
    rules,
    statuses,
    entries,
    loans,
    incomes,
    monthlyBudget,
  ]);
  const creditExposure = useMemo(
    () => (ctx ? getCreditExposure(ctx).total : 0),
    [ctx],
  );

  function openAdd(kind: AccountKind) {
    hapticTap();
    setEditingId(null);
    setEditingKind(kind);
    setEditOpen(true);
  }

  function openEdit(a: Account) {
    hapticTap();
    setEditingId(a.id);
    setEditingKind(a.kind);
    setEditOpen(true);
  }

  if (!hydrated) return null;

  const stalest = banks
    .map((a) => daysSince(a.anchorUpdatedAt) ?? 0)
    .reduce((m, n) => (n > m ? n : m), 0);
  const bankStatus =
    activeBanks.length === 0
      ? "אין חשבונות פעילים"
      : stalest >= 7
        ? `לעדכן · ${stalest} ימים`
        : "עדכני";
  const cardStatus =
    activeCards.length === 0
      ? "אין כרטיסים פעילים"
      : `${activeCards.length} פעילים`;

  return (
    <div className="acc-root" dir="rtl">
      <div className="acc-tiles">
        <AccountTile
          icon={<Landmark className="size-4" />}
          label="חשבונות בנק"
          headline={ILS.format(Math.round(totalLiquidity))}
          hint={bankStatus}
          count={banks.length}
          tone="safe"
          onClick={() => {
            hapticTap();
            setSheet("bank");
          }}
        />
        <AccountTile
          icon={<CreditCard className="size-4" />}
          label="כרטיסי אשראי"
          headline={ILS.format(Math.round(creditExposure))}
          hint={cardStatus}
          count={cards.length}
          tone="cyan"
          onClick={() => {
            hapticTap();
            setSheet("card");
          }}
        />
      </div>

      <div className="acc-quick">
        <button
          type="button"
          className="acc-quick-btn acc-quick-btn-primary"
          onClick={() => openAdd(sheet === "card" ? "card" : "bank")}
          aria-label="הוסף חשבון או כרטיס חדש"
        >
          <Plus className="size-4" />
          הוסף
        </button>
        <button
          type="button"
          className="acc-quick-btn"
          onClick={() => {
            hapticTap();
            setSheet(cards.length >= banks.length ? "card" : "bank");
          }}
        >
          נהל / ערוך
          <ChevronLeft className="size-4" />
        </button>
      </div>

      {/* Banks sheet — full drilldown */}
      <BottomSheet
        open={sheet === "bank"}
        onOpenChange={(o) => setSheet(o ? "bank" : null)}
        title="חשבונות בנק"
        className="acc-sheet"
      >
        <div className="acc-sheet-body" dir="rtl">
          <header className="acc-sheet-head">
            <div>
              <span className="acc-sheet-eyebrow">חשבונות בנק</span>
              <span className="acc-sheet-title">
                {ILS.format(Math.round(totalLiquidity))}
              </span>
              <span className="acc-sheet-hint">
                {activeBanks.length}/{banks.length} פעילים
              </span>
            </div>
          </header>
          {banks.length === 0 ? (
            <MiniAppEmpty
              icon={Landmark}
              title="עוד אין חשבון בנק"
              body="הוסף חשבון כדי לתת ל-Pulse נקודת התחלה ולראות מאזן חי בלשונית זמן."
              cta={{ label: "הוסף חשבון בנק", onClick: () => openAdd("bank") }}
            />
          ) : (
            <>
              <MiniAppAddCta
                label="הוסף חשבון בנק"
                onClick={() => openAdd("bank")}
              />
              <ul className="acc-list">
                {banks.map((a) => {
                  const stale = daysSince(a.anchorUpdatedAt);
                  const isStale = stale !== undefined && stale >= 7;
                  const balance = a.anchorBalance ?? 0;
                  const tone = a.active ? BANK_TONE : "#A1A1AA";
                  const status = !a.active
                    ? { tone: "#A1A1AA", label: "מושהה" }
                    : isStale
                      ? { tone: "#FBBF24", label: "צריך עדכון" }
                      : { tone: BANK_TONE, label: "עדכני" };
                  const subtitle =
                    stale === undefined
                      ? "לחץ כדי להגדיר יתרה"
                      : stale === 0
                        ? "עודכן היום"
                        : stale === 1
                          ? "עודכן אתמול"
                          : `עודכן לפני ${stale} ימים`;
                  return (
                    <li key={a.id}>
                      <MiniAppListCard
                        icon={Landmark}
                        tone={tone}
                        title={a.label || "חשבון"}
                        subtitle={subtitle}
                        primaryValue={ILS.format(balance)}
                        primaryCaption="יתרה"
                        status={status}
                        onClick={() => openEdit(a)}
                      />
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
      </BottomSheet>

      {/* Cards sheet — full drilldown */}
      <BottomSheet
        open={sheet === "card"}
        onOpenChange={(o) => setSheet(o ? "card" : null)}
        title="כרטיסי אשראי"
        className="acc-sheet"
      >
        <div className="acc-sheet-body" dir="rtl">
          <header className="acc-sheet-head">
            <div>
              <span className="acc-sheet-eyebrow">חשיפת אשראי · חודש</span>
              <span className="acc-sheet-title">
                {ILS.format(Math.round(creditExposure))}
              </span>
              <span className="acc-sheet-hint">
                {activeCards.length}/{cards.length} פעילים
              </span>
            </div>
          </header>
          {cards.length === 0 ? (
            <MiniAppEmpty
              icon={CreditCard}
              title="עוד אין כרטיס"
              body="הוסף כרטיס כדי שחיובי SMS / Wallet ינווטו לכרטיס הנכון ויופיעו על הציר ביום החיוב."
              cta={{ label: "הוסף כרטיס", onClick: () => openAdd("card") }}
            />
          ) : (
            <>
              <MiniAppAddCta
                label="הוסף כרטיס"
                onClick={() => openAdd("card")}
              />
              <ul className="acc-list">
                {cards.map((a) => {
                  const tone = a.active ? CARD_TONE : "#A1A1AA";
                  const subtitleParts: string[] = [];
                  if (a.cardLast4) subtitleParts.push(`····${a.cardLast4}`);
                  if (a.billingDay) subtitleParts.push(`סגירה ${a.billingDay}`);
                  if (a.paymentDay) subtitleParts.push(`חיוב ${a.paymentDay}`);
                  const subtitle =
                    subtitleParts.join(" · ") || "ללא קונפיגורציה";
                  const status = a.active
                    ? { tone: CARD_TONE, label: "פעיל" }
                    : { tone: "#A1A1AA", label: "מושהה" };
                  const limitCaption = a.creditLimit
                    ? `מסגרת ${ILS.format(a.creditLimit)}`
                    : undefined;
                  return (
                    <li key={a.id}>
                      <MiniAppListCard
                        icon={a.active ? CheckCircle2 : AlertTriangle}
                        tone={tone}
                        title={a.label || "כרטיס"}
                        subtitle={subtitle}
                        primaryValue={a.cardLast4 ? `····${a.cardLast4}` : "—"}
                        primaryCaption={limitCaption}
                        status={status}
                        onClick={() => openEdit(a)}
                      />
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
      </BottomSheet>

      <AccountFullScreenEdit
        accountId={editingId}
        defaultKind={editingKind}
        open={editOpen}
        onOpenChange={(o) => {
          setEditOpen(o);
          if (!o) setEditingId(null);
        }}
      />
    </div>
  );
}

function AccountTile({
  icon,
  label,
  headline,
  hint,
  count,
  tone,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  headline: string;
  hint: string;
  count: number;
  tone: "safe" | "cyan";
  onClick: () => void;
}) {
  return (
    <motion.button
      type="button"
      className="acc-tile"
      data-tone={tone}
      onClick={onClick}
      whileTap={{ scale: 0.97 }}
      transition={{ type: "spring", stiffness: 380, damping: 34 }}
      aria-label={`${label} · ${headline}`}
    >
      <span aria-hidden className="acc-tile-icon">
        {icon}
      </span>
      <span className="acc-tile-label">{label}</span>
      <span className="acc-tile-headline" data-mono="true" dir="ltr">
        {headline}
      </span>
      <span className="acc-tile-hint">
        {hint}
        <span aria-hidden className="acc-tile-count" data-mono="true" dir="ltr">
          {count}
        </span>
      </span>
    </motion.button>
  );
}
