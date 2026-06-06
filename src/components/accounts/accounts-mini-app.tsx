"use client";

// Phase 412 — Accounts folder as a mini-app.
//
// Splits the flat AccountsPanel into two visually-distinct sections:
//   • חשבונות בנק — hero with total liquidity + per-bank card with
//     anchor balance, last-updated freshness chip.
//   • כרטיסי אשראי — hero with credit exposure + per-card card with
//     issuer brand + last4 + paymentDay countdown.
// Tap any card → AccountFullScreenEdit. Empty state per section
// guides the user to add the first row.

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  CreditCard,
  Landmark,
} from "lucide-react";

import { useFinanceStore } from "@/lib/store";
import {
  buildEngineCtx,
  getCreditExposure,
} from "@/lib/financial-engine";
import { currentMonthKey } from "@/lib/dates";
import {
  MiniAppAddCta,
  MiniAppEmpty,
  MiniAppHero,
  MiniAppListCard,
  MiniAppSectionLabel,
  type MiniAppKpi,
} from "@/components/ui/mini-app-shell";
import { AccountFullScreenEdit } from "@/components/accounts/account-fullscreen-edit";
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

export function AccountsMiniApp() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const accounts = useFinanceStore((s) => s.accounts);
  const rules = useFinanceStore((s) => s.rules);
  const statuses = useFinanceStore((s) => s.statuses);
  const entries = useFinanceStore((s) => s.entries);
  const loans = useFinanceStore((s) => s.loans);
  const incomes = useFinanceStore((s) => s.incomes);
  const monthlyBudget = useFinanceStore((s) => s.monthlyBudget);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingKind, setEditingKind] = useState<AccountKind>("bank");
  const [editOpen, setEditOpen] = useState(false);

  const banks = accounts.filter((a) => a.kind === "bank");
  const cards = accounts.filter((a) => a.kind === "card");
  const activeBanks = banks.filter((a) => a.active);

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
    setEditingId(null);
    setEditingKind(kind);
    setEditOpen(true);
  }

  function openEdit(a: Account) {
    setEditingId(a.id);
    setEditingKind(a.kind);
    setEditOpen(true);
  }

  if (!hydrated) return null;

  const bankKpis: MiniAppKpi[] = [
    {
      label: "סך נזילות",
      value: ILS.format(totalLiquidity),
      tone: BANK_TONE,
      emphasis: true,
      caption:
        activeBanks.length === 0
          ? "אין חשבונות פעילים"
          : activeBanks.length === 1
            ? "חשבון אחד פעיל"
            : `${activeBanks.length} חשבונות פעילים`,
    },
  ];

  const cardKpis: MiniAppKpi[] = [
    {
      label: "חשיפת אשראי החודש",
      value: ILS.format(Math.round(creditExposure)),
      tone: CARD_TONE,
      emphasis: true,
      caption:
        cards.length === 0
          ? "אין כרטיסים"
          : cards.length === 1
            ? "כרטיס אחד"
            : `${cards.length} כרטיסים`,
    },
  ];

  return (
    <div className="flex flex-col gap-4" dir="rtl">
      {/* Bank section */}
      <section className="flex flex-col gap-3">
        <MiniAppHero
          title="חשבונות בנק"
          subtitle="יתרה חיה לכל חשבון. עדכן ידנית כדי לשמור על דיוק."
          kpis={bankKpis}
        />
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
            <ul className="flex flex-col gap-2">
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
      </section>

      {/* Card section */}
      <section className="flex flex-col gap-3">
        <MiniAppSectionLabel>כרטיסי אשראי</MiniAppSectionLabel>
        <MiniAppHero
          title="כרטיסי אשראי"
          subtitle="מנפיק, ארבע ספרות, יום סגירה ויום חיוב."
          kpis={cardKpis}
        />
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
            <ul className="flex flex-col gap-2">
              {cards.map((a) => {
                const tone = a.active ? CARD_TONE : "#A1A1AA";
                const subtitleParts: string[] = [];
                if (a.cardLast4) subtitleParts.push(`····${a.cardLast4}`);
                if (a.billingDay) subtitleParts.push(`סגירה ${a.billingDay}`);
                if (a.paymentDay) subtitleParts.push(`חיוב ${a.paymentDay}`);
                const subtitle = subtitleParts.join(" · ") || "ללא קונפיגורציה";
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
      </section>

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
