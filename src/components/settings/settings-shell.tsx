"use client";

// Settings · premium Shell.
//
// UI-only redesign. Replaces the previous accordion-list surface
// with an iOS/Notion/Revolut-style card grid: every setting is a
// compact row (icon + title + one-line description + optional
// preview badge + chevron). Tapping a row opens a BottomSheet
// carrying the existing mini-app / card — logic, data model,
// APIs, and every downstream engine remain byte-for-byte
// untouched.
//
// One sheet at a time. Escape / drag-down / backdrop tap all
// route through the shared BottomSheet primitive.

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Bell,
  ChevronLeft,
  Cloud,
  CreditCard,
  Database,
  FileDown,
  HandCoins,
  Info,
  Landmark,
  Languages,
  Moon,
  Palette,
  PiggyBank,
  Repeat,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Target,
  Type,
  UserCircle2,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";

import { useFinanceStore } from "@/lib/store";
import { useDevMode } from "@/lib/use-dev-mode";
import { currentMonthKey } from "@/lib/dates";
import { buildSmartAlerts } from "@/lib/alerts";
import { tap as hapticTap } from "@/lib/haptics";

// Existing mini-apps + cards — mounted inside sheets, not
// changed in any way.
import { AccountsMiniApp } from "@/components/accounts/accounts-mini-app";
import { LoansMiniApp } from "@/components/loans/loans-mini-app";
import { IncomeMiniApp } from "@/components/income/income-mini-app";
import { RecurringMiniApp } from "@/components/recurring/recurring-mini-app";
import { BudgetMiniApp } from "./budget-mini-app";
import { AlertsCenter } from "./alerts-center";
import { NotificationsMiniApp } from "./notifications-mini-app";
import { ShortcutMiniApp } from "./shortcut-mini-app";
import { StatementImport } from "./statement-import";
import { SallyCsvImportCard } from "./sally-csv-import-card";
import { ReceiptScanCard } from "./receipt-scan-card";
import { BackupsCard } from "./backups-card";
import { CloudSyncCard } from "./cloud-sync-card";
import { IntegrationInfo } from "./integration-info";
import { PushDiagnosticsCard } from "./push-diagnostics-card";
import { BudgetSettingsDiagnostics } from "./budget-settings-diagnostics";
import { TextSizeCard } from "./text-size-card";
import { ThemeCard } from "./theme-card";
import { AuthCard } from "./auth-card";
import { DevModeToggleCard } from "./dev-mode-toggle-card";

type Tone =
  | "gold"
  | "cyan"
  | "purple"
  | "safe"
  | "watch"
  | "danger"
  | "neutral";

type SheetId =
  | "language"
  | "theme"
  | "text-size"
  | "bank-accounts"
  | "credit-cards"
  | "loans"
  | "incomes"
  | "recurring"
  | "budget"
  | "alerts"
  | "notifications"
  | "iphone"
  | "io"
  | "backup"
  | "privacy"
  | "automations"
  | "engine"
  | "account"
  | "about"
  | null;

type Card = {
  id: SheetId;
  icon: LucideIcon;
  title: string;
  description: string;
  tone: Tone;
  preview?: string;
  disabled?: boolean;
};

type Section = {
  title: string;
  emoji: string;
  cards: Card[];
};

const MONTH_FMT_HE = new Intl.DateTimeFormat("he-IL", {
  month: "long",
  year: "numeric",
});

export function SettingsShell({
  onClose,
}: {
  /** When provided, the shell renders its X-close chip and calls
   *  this handler on tap. Used by the Settings Center overlay in
   *  the top nav; omit to render inline (dev routes). */
  onClose?: () => void;
} = {}) {
  const { on: devOn } = useDevMode();
  const [sheet, setSheet] = useState<SheetId>(null);

  // Preview counts — pulled from the store. All selectors are
  // narrow so unrelated re-renders don't cascade.
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const accounts = useFinanceStore((s) => s.accounts);
  const loans = useFinanceStore((s) => s.loans);
  const incomes = useFinanceStore((s) => s.incomes);
  const rules = useFinanceStore((s) => s.rules);
  const statuses = useFinanceStore((s) => s.statuses);
  const entries = useFinanceStore((s) => s.entries);
  const monthlyBudget = useFinanceStore((s) => s.monthlyBudget);
  const budgetMode = useFinanceStore((s) => s.budgetMode);
  const audioEnabled = useFinanceStore((s) => s.audioEnabled);

  const monthKey = currentMonthKey();
  const alerts = useMemo(() => {
    if (!hydrated) return [];
    return buildSmartAlerts({
      accounts,
      loans,
      incomes,
      rules,
      statuses,
      entries,
      monthlyBudget,
      monthKey,
    });
  }, [
    hydrated,
    accounts,
    loans,
    incomes,
    rules,
    statuses,
    entries,
    monthlyBudget,
    monthKey,
  ]);

  const bankCount = accounts.filter((a) => a.kind === "bank" && a.active).length;
  const cardCount = accounts.filter((a) => a.kind === "card" && a.active).length;
  const loanCount = loans.filter((l) => l.active).length;
  const incomeCount = incomes.filter((i) => i.active).length;
  const ruleCount = rules.filter((r) => r.active).length;
  const alertCount = alerts.length;
  const importantAlerts = alerts.filter((a) => a.level === "important").length;

  const sections: Section[] = [
    {
      emoji: "👤",
      title: "פרופיל ומערכת",
      cards: [
        {
          id: "account",
          icon: UserCircle2,
          tone: "purple",
          title: "פרטי חשבון",
          description: "התחברות, יציאה וטוקנים",
        },
        {
          id: "theme",
          icon: Palette,
          tone: "cyan",
          title: "מצב תצוגה",
          description: "לילה · יום · אוטומטי",
        },
        {
          id: "text-size",
          icon: Type,
          tone: "gold",
          title: "גודל טקסט",
          description: "קומפקטי · רגיל · גדול",
        },
        {
          id: "language",
          icon: Languages,
          tone: "neutral",
          title: "שפה",
          description: "עברית · ברירת מחדל של המערכת",
          preview: "עברית",
          disabled: true,
        },
        {
          id: "about",
          icon: Info,
          tone: "neutral",
          title: "אודות Sally",
          description: "גרסה, קרדיטים ופלטפורמה",
          preview: "0.1.0",
        },
      ],
    },
    {
      emoji: "💰",
      title: "כספים",
      cards: [
        {
          id: "bank-accounts",
          icon: Landmark,
          tone: "safe",
          title: "חשבונות בנק",
          description: "יתרות, חיוב יומי, חיבור",
          preview:
            bankCount === 0
              ? "אין חשבון"
              : bankCount === 1
                ? "חשבון אחד"
                : `${bankCount} חשבונות`,
        },
        {
          id: "credit-cards",
          icon: CreditCard,
          tone: "cyan",
          title: "כרטיסי אשראי",
          description: "מסגרת, יום חיוב וניצול",
          preview:
            cardCount === 0
              ? "אין כרטיס"
              : cardCount === 1
                ? "כרטיס אחד"
                : `${cardCount} כרטיסים`,
        },
        {
          id: "loans",
          icon: PiggyBank,
          tone: "purple",
          title: "הלוואות",
          description: "תשלום חודשי, יתרה וסיום",
          preview:
            loanCount === 0
              ? "אין הלוואה"
              : loanCount === 1
                ? "הלוואה אחת"
                : `${loanCount} הלוואות`,
        },
        {
          id: "incomes",
          icon: HandCoins,
          tone: "gold",
          title: "הכנסות",
          description: "משכורות, פנסיה, צד-משלח",
          preview:
            incomeCount === 0
              ? "אין הכנסה"
              : incomeCount === 1
                ? "מקור אחד"
                : `${incomeCount} מקורות`,
        },
        {
          id: "recurring",
          icon: Repeat,
          tone: "cyan",
          title: "הוצאות קבועות ומנויים",
          description: "חיובים חוזרים לפי כרטיס",
          preview:
            ruleCount === 0
              ? "אין קבוע"
              : ruleCount === 1
                ? "חוק אחד"
                : `${ruleCount} חוקים`,
        },
        {
          id: "budget",
          icon: Target,
          tone: "watch",
          title: "בקרת תקציב",
          description:
            budgetMode === "auto"
              ? "חישוב אוטומטי מהיתרה"
              : "יעד חודשי ידני",
          preview:
            budgetMode === "auto"
              ? "אוטומטי"
              : monthlyBudget > 0
                ? `₪${Math.round(monthlyBudget).toLocaleString("he-IL")}`
                : "לא הוגדר",
        },
      ],
    },
    {
      emoji: "🤖",
      title: "אוטומציות",
      cards: [
        {
          id: "automations",
          icon: Sparkles,
          tone: "cyan",
          title: "מרכז התראות חכם",
          description: "חיובים חריגים, יעדים, חריגות",
          preview:
            alertCount === 0
              ? "שקט"
              : importantAlerts > 0
                ? `${importantAlerts} חשובות`
                : `${alertCount} התראות`,
        },
        {
          id: "notifications",
          icon: Bell,
          tone: "cyan",
          title: "Push וצליל",
          description: "אישור הוצאה, צליל סנכרון",
          preview: audioEnabled ? "צליל פעיל" : "פעיל",
        },
        {
          id: "iphone",
          icon: Smartphone,
          tone: "purple",
          title: "קיצור iPhone / Apple Pay",
          description: "קליטה אוטומטית מ-CAL / MAX",
        },
      ],
    },
    {
      emoji: "🗂",
      title: "נתונים וגיבוי",
      cards: [
        {
          id: "io",
          icon: FileDown,
          tone: "gold",
          title: "ייבוא / ייצוא",
          description: "CSV, גיבוי Sally, סריקת קבלה",
        },
        {
          id: "backup",
          icon: Cloud,
          tone: "cyan",
          title: "גיבויים וסנכרון ענן",
          description: "מקומי, ענן והתאוששות",
        },
        {
          id: "privacy",
          icon: ShieldCheck,
          tone: "safe",
          title: "פרטיות ואבטחה",
          description: "אימות, טוקנים, מזהה מכשיר",
        },
        {
          id: "engine",
          icon: Database,
          tone: "neutral",
          title: "מצב פיתוח ואבחון",
          description: devOn
            ? "יומני Sync, Push ומזהה"
            : "הפעל מצב פיתוח כדי לראות",
          preview: devOn ? "פעיל" : "כבוי",
        },
      ],
    },
  ];

  function open(id: SheetId) {
    if (id === "language") return; // reserved / disabled
    hapticTap();
    setSheet(id);
  }

  function close() {
    setSheet(null);
  }

  return (
    <div className="set-shell" dir="rtl">
      {onClose ? (
        <div className="set-shell-hero">
          <button
            type="button"
            className="set-shell-close"
            onClick={onClose}
            aria-label="סגור הגדרות"
          >
            <X className="size-4" strokeWidth={2} />
          </button>
          <div className="set-shell-hero-text">
            <span className="set-shell-hero-eyebrow">SALLY · CONTROL</span>
            <h2 className="set-shell-hero-title">מרכז הגדרות המערכת</h2>
            <span className="set-shell-hero-sub">
              פרופיל, כספים, אוטומציות ונתונים — הכל במקום אחד.
            </span>
          </div>
        </div>
      ) : null}

      {sections.map((section) => (
        <section key={section.title} className="set-section">
          <header className="set-section-head">
            <span aria-hidden className="set-section-emoji">
              {section.emoji}
            </span>
            <h3 className="set-section-title">{section.title}</h3>
          </header>
          <ul className="set-cards">
            {section.cards.map((c) => (
              <li key={String(c.id)}>
                <SettingsCard card={c} onClick={() => open(c.id)} />
              </li>
            ))}
          </ul>
        </section>
      ))}

      {/* Sheets — one per card. */}
      <SheetShell open={sheet === "theme"} title="מצב תצוגה" onClose={close}>
        <ThemeCard />
      </SheetShell>
      <SheetShell open={sheet === "text-size"} title="גודל טקסט" onClose={close}>
        <TextSizeCard />
      </SheetShell>
      <SheetShell
        open={sheet === "bank-accounts"}
        title="חשבונות בנק"
        onClose={close}
      >
        <AccountsMiniApp />
      </SheetShell>
      <SheetShell
        open={sheet === "credit-cards"}
        title="כרטיסי אשראי"
        onClose={close}
      >
        <AccountsMiniApp />
      </SheetShell>
      <SheetShell open={sheet === "loans"} title="הלוואות" onClose={close}>
        <LoansMiniApp />
      </SheetShell>
      <SheetShell open={sheet === "incomes"} title="הכנסות" onClose={close}>
        <IncomeMiniApp />
      </SheetShell>
      <SheetShell
        open={sheet === "recurring"}
        title="הוצאות קבועות ומנויים"
        onClose={close}
      >
        <RecurringMiniApp />
      </SheetShell>
      <SheetShell open={sheet === "budget"} title="בקרת תקציב" onClose={close}>
        <BudgetMiniApp />
      </SheetShell>
      <SheetShell
        open={sheet === "notifications"}
        title="Push וצליל"
        onClose={close}
      >
        <NotificationsMiniApp />
      </SheetShell>
      <SheetShell open={sheet === "iphone"} title="קיצור iPhone" onClose={close}>
        <ShortcutMiniApp />
      </SheetShell>
      <SheetShell open={sheet === "io"} title="ייבוא וייצוא" onClose={close}>
        <div className="flex flex-col gap-3">
          <StatementImport />
          <SallyCsvImportCard />
          <ReceiptScanCard />
        </div>
      </SheetShell>
      <SheetShell open={sheet === "backup"} title="גיבויים" onClose={close}>
        <div className="flex flex-col gap-3">
          <BackupsCard />
          <CloudSyncCard />
        </div>
      </SheetShell>
      <SheetShell
        open={sheet === "automations"}
        title="מרכז התראות חכם"
        onClose={close}
      >
        <AlertsCenter />
      </SheetShell>
      <SheetShell
        open={sheet === "privacy"}
        title="פרטיות ואבטחה"
        onClose={close}
      >
        <div className="flex flex-col gap-3">
          <AuthCard />
          <IntegrationInfo />
        </div>
      </SheetShell>
      <SheetShell
        open={sheet === "engine"}
        title="נתונים ומנוע חישוב"
        onClose={close}
      >
        <div className="flex flex-col gap-3">
          <DevModeToggleCard />
          {devOn ? (
            <>
              <CloudSyncCard />
              <IntegrationInfo />
              <PushDiagnosticsCard />
              <BudgetSettingsDiagnostics />
            </>
          ) : null}
        </div>
      </SheetShell>
      <SheetShell open={sheet === "account"} title="החשבון שלי" onClose={close}>
        <AuthCard />
      </SheetShell>
      <SheetShell open={sheet === "about"} title="אודות Sally" onClose={close}>
        <AboutCard />
      </SheetShell>
    </div>
  );
}

function SettingsCard({
  card,
  onClick,
}: {
  card: Card;
  onClick: () => void;
}) {
  const Icon = card.icon;
  const preview = card.preview;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={card.disabled}
      className="set-card"
      data-tone={card.tone}
      aria-label={`${card.title} · ${card.description}`}
    >
      <span aria-hidden className="set-card-icon">
        <Icon strokeWidth={1.7} />
      </span>
      <span className="set-card-body">
        <span className="set-card-title">{card.title}</span>
        <span className="set-card-desc">{card.description}</span>
      </span>
      {preview ? <span className="set-card-preview">{preview}</span> : null}
      <span aria-hidden className="set-card-chev">
        <ChevronLeft className="size-4" />
      </span>
    </button>
  );
}

function SheetShell({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  // Deliberately NOT a Dialog — mini-apps mounted inside can open
  // their OWN Dialog (FullScreenEditShell / BottomSheet) without a
  // focus-trap fight. A plain overlay preserves the Apple-Pay
  // aesthetic (bottom drawer + backdrop blur + spring) while
  // staying inert with respect to nested modal primitives.
  const reduced = useReducedMotion();

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open ? (
        <div
          className="set-overlay"
          role="dialog"
          aria-modal="true"
          aria-label={title}
        >
          <motion.button
            type="button"
            aria-label="סגור"
            className="set-overlay-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduced ? 0.12 : 0.24 }}
            onClick={onClose}
          />
          <motion.div
            className="set-overlay-panel"
            initial={reduced ? { opacity: 0 } : { y: "100%" }}
            animate={reduced ? { opacity: 1 } : { y: 0 }}
            exit={reduced ? { opacity: 0 } : { y: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 32 }}
            dir="rtl"
          >
            <div className="set-overlay-head">
              <button
                type="button"
                className="set-overlay-close"
                onClick={onClose}
                aria-label="סגור"
              >
                <X className="size-4" strokeWidth={2} />
              </button>
              <span className="set-overlay-title">{title}</span>
              <span aria-hidden className="set-overlay-spacer" />
            </div>
            <div className="set-overlay-body">
              <div className="set-sheet-body">{children}</div>
            </div>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
}

function AboutCard() {
  return (
    <div className="set-about" dir="rtl">
      <div className="set-about-hero">
        <span aria-hidden className="set-about-icon">
          <Moon className="size-5" strokeWidth={1.6} />
        </span>
        <div className="set-about-titles">
          <span className="set-about-name">Sally</span>
          <span className="set-about-tag">Smart Expense Tracker</span>
        </div>
      </div>
      <dl className="set-about-list">
        <div className="set-about-row">
          <dt>גרסה</dt>
          <dd data-mono="true" dir="ltr">
            0.1.0
          </dd>
        </div>
        <div className="set-about-row">
          <dt>פלטפורמה</dt>
          <dd>Next.js 16 · React 19</dd>
        </div>
        <div className="set-about-row">
          <dt>עדכון אחרון</dt>
          <dd>{MONTH_FMT_HE.format(new Date())}</dd>
        </div>
      </dl>
      <div className="set-about-icon-row" aria-hidden>
        <span className="set-about-wallet-icon">
          <Wallet className="size-3.5" />
        </span>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Settings Center — full-screen overlay opened from the header
// gear button. Wraps the same SettingsShell inside a plain
// fixed overlay (NOT a Dialog) so nested BottomSheets that
// carry the mini-apps can still open without a focus-trap
// fight. Body scroll is locked while open.
// ────────────────────────────────────────────────────────────

export function SettingsCenter({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const reduced = useReducedMotion();

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open ? (
        <div
          className="set-center"
          role="dialog"
          aria-modal="true"
          aria-label="מרכז הגדרות המערכת"
        >
          <motion.div
            className="set-center-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduced ? 0.12 : 0.28 }}
            onClick={onClose}
            aria-hidden
          />
          <motion.div
            className="set-center-panel"
            initial={reduced ? { opacity: 0 } : { y: "100%" }}
            animate={reduced ? { opacity: 1 } : { y: 0 }}
            exit={reduced ? { opacity: 0 } : { y: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 32 }}
            dir="rtl"
          >
            <div className="set-center-scroll">
              <SettingsShell onClose={onClose} />
            </div>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
}
