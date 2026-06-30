"use client";

// Phase 437 · AURORA v1 — Settings screen
//
// Real product surface. Reads from the existing store and exposes
// only safe, UI-level setters that were already part of the store
// API: setMonthlyBudget / setTheme / setTextScale / setAudioEnabled
// + supabase.signOut. NO new business logic, no engine changes, no
// financial mutations. Lists for Accounts / Loans / Incomes /
// Categories are read-only previews — full CRUD already lives in
// the legacy settings tab and will plug in when its own AURORA
// phase ships.

import { useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { toast } from "sonner";

import { Eyebrow } from "@/components/aurora/aurora-eyebrow";
import { GlassCard } from "@/components/aurora/aurora-glass-card";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { CATEGORIES } from "@/lib/categories";
import { useFinanceStore } from "@/lib/store";
import { useCloudSyncState } from "@/lib/supabase/cloud-sync-context";
import { signOut } from "@/lib/supabase/auth";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

const THEME_OPTIONS: Array<{ key: "dark" | "light" | "auto"; label: string }> = [
  { key: "dark", label: "כהה" },
  { key: "light", label: "בהיר" },
  { key: "auto", label: "אוטומטי" },
];

const TEXT_OPTIONS: Array<{ key: "compact" | "normal" | "large"; label: string }> = [
  { key: "compact", label: "קומפקטי" },
  { key: "normal", label: "רגיל" },
  { key: "large", label: "גדול" },
];

export function AuroraSettings() {
  const accounts = useFinanceStore((s) => s.accounts);
  const loans = useFinanceStore((s) => s.loans);
  const incomes = useFinanceStore((s) => s.incomes);
  const monthlyBudget = useFinanceStore((s) => s.monthlyBudget);
  const theme = useFinanceStore((s) => s.theme);
  const textScale = useFinanceStore((s) => s.textScale);
  const audioEnabled = useFinanceStore((s) => s.audioEnabled);
  const setMonthlyBudget = useFinanceStore((s) => s.setMonthlyBudget);
  const setTheme = useFinanceStore((s) => s.setTheme);
  const setTextScale = useFinanceStore((s) => s.setTextScale);
  const setAudioEnabled = useFinanceStore((s) => s.setAudioEnabled);

  const cloud = useCloudSyncState();
  const [budgetSheet, setBudgetSheet] = useState(false);
  const [budgetDraft, setBudgetDraft] = useState<string>(
    String(monthlyBudget || 0),
  );
  const [signingOut, setSigningOut] = useState(false);

  const banks = useMemo(
    () => accounts.filter((a) => a.kind === "bank"),
    [accounts],
  );
  const cards = useMemo(
    () => accounts.filter((a) => a.kind === "card"),
    [accounts],
  );

  const isAuthed = Boolean(cloud?.authenticated);
  const isCloudConfigured = Boolean(cloud?.configured);

  const handleSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    const res = await signOut();
    setSigningOut(false);
    if (res.ok) {
      toast.success("התנתקת בהצלחה");
    } else {
      toast.error("לא הצלחנו להתנתק");
    }
  };

  const handleBudgetSave = () => {
    const n = Number.parseFloat(budgetDraft.replace(/,/g, ""));
    if (!Number.isFinite(n) || n < 0) {
      toast.error("הזן ערך תקף");
      return;
    }
    setMonthlyBudget(Math.round(n));
    setBudgetSheet(false);
    toast.success(`התקציב עודכן ל-${ILS.format(Math.round(n))}`);
  };

  return (
    <div className="aurora-settings-stack">
      <h1 className="sr-only">הגדרות</h1>

      {/* Profile / connection */}
      <GlassCard elevation="elev-1" padding="spacious" radius="hero">
        <Eyebrow srHeading={{ level: 2, text: "חשבון" }}>חשבון</Eyebrow>
        <div className="aurora-settings-profile">
          <div className="aurora-settings-avatar" aria-hidden>
            {isAuthed ? "P" : "—"}
          </div>
          <div className="aurora-settings-profile-body">
            <span className="aurora-settings-profile-title">
              {isAuthed ? "מחובר" : isCloudConfigured ? "אורח" : "מצב מקומי"}
            </span>
            <span className="aurora-settings-profile-hint">
              {isAuthed
                ? "המידע נשמר ומסונכרן בענן"
                : isCloudConfigured
                  ? "התחבר כדי לסנכרן בין מכשירים"
                  : "ענן לא מוגדר · נתונים נשמרים מקומית בלבד"}
            </span>
          </div>
          {isAuthed ? (
            <button
              type="button"
              className="aurora-settings-secondary"
              onClick={handleSignOut}
              disabled={signingOut}
            >
              {signingOut ? "מתנתק…" : "התנתק"}
            </button>
          ) : isCloudConfigured ? (
            <a href="/sign-in" className="aurora-settings-cta">
              התחבר
            </a>
          ) : null}
        </div>
      </GlassCard>

      {/* Budget */}
      <SettingsCard
        title="תקציב חודשי"
        hint="היעד שמשמש את סרגל הבקרה ואת חיזוי סוף החודש"
        action={
          <button
            type="button"
            className="aurora-settings-secondary"
            onClick={() => {
              setBudgetDraft(String(monthlyBudget || 0));
              setBudgetSheet(true);
            }}
          >
            ערוך
          </button>
        }
      >
        <span dir="ltr" className="aurora-settings-amount">
          {ILS.format(monthlyBudget || 0)}
        </span>
        <span className="aurora-body aurora-ink-3">לחודש</span>
      </SettingsCard>

      {/* Accounts */}
      <SettingsCard
        title="חשבונות בנק"
        hint="היתרה החיה שמזינה את חיזוי סוף החודש"
        action={
          <span className="aurora-settings-count">
            {banks.length} פעילים
          </span>
        }
      >
        {banks.length === 0 ? (
          <EmptyHint text="עדיין אין חשבון בנק. הוסף יתרה במסך ההגדרות הקלאסי כדי להפעיל את חיזוי סוף החודש." />
        ) : (
          <ul className="aurora-settings-list">
            {banks.map((a) => (
              <li key={a.id} className="aurora-settings-list-row">
                <div className="aurora-settings-list-body">
                  <span className="aurora-settings-list-title">{a.label}</span>
                  <span className="aurora-settings-list-hint">
                    {a.active ? "פעיל" : "מושבת"}
                    {typeof a.anchorBalance === "number"
                      ? ` · יתרה ${ILS.format(a.anchorBalance)}`
                      : ""}
                  </span>
                </div>
                <span
                  aria-hidden
                  className="aurora-pill-status"
                  data-aurora-tone={a.active ? "safe" : "watch"}
                >
                  {a.active ? "פעיל" : "מושבת"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </SettingsCard>

      {/* Cards */}
      <SettingsCard
        title="כרטיסי אשראי"
        hint="כל כרטיס שנמצא בשימוש כדי לפרוס חיובים נכנסים"
        action={
          <span className="aurora-settings-count">{cards.length}</span>
        }
      >
        {cards.length === 0 ? (
          <EmptyHint text="אין כרטיסים מחוברים. הוספה תיפתח במסך כרטיסים מלא בשלב הבא." />
        ) : (
          <ul className="aurora-settings-list">
            {cards.map((c) => (
              <li key={c.id} className="aurora-settings-list-row">
                <div className="aurora-settings-list-body">
                  <span className="aurora-settings-list-title">{c.label}</span>
                  <span className="aurora-settings-list-hint" dir="ltr">
                    {c.issuer ?? "—"} · ****{c.cardLast4 ?? "----"}
                  </span>
                </div>
                <span
                  aria-hidden
                  className="aurora-pill-status"
                  data-aurora-tone={c.active ? "safe" : "watch"}
                >
                  {c.active ? "פעיל" : "מושבת"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </SettingsCard>

      {/* Loans */}
      <SettingsCard
        title="הלוואות פעילות"
        hint="נכנסות אוטומטית לחיזוי סוף החודש"
        action={
          <span className="aurora-settings-count">{loans.length}</span>
        }
      >
        {loans.length === 0 ? (
          <EmptyHint text="אין הלוואות. הוסף הלוואה במסך ההגדרות הקלאסי כדי להפעיל את חיזוי החיובים." />
        ) : (
          <ul className="aurora-settings-list">
            {loans.map((l) => (
              <li key={l.id} className="aurora-settings-list-row">
                <div className="aurora-settings-list-body">
                  <span className="aurora-settings-list-title">{l.label}</span>
                  <span className="aurora-settings-list-hint" dir="ltr">
                    {ILS.format(l.monthlyInstallment)}/חודש · יום {l.dayOfMonth}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </SettingsCard>

      {/* Incomes */}
      <SettingsCard
        title="הכנסות חוזרות"
        hint="משכורת, קצבאות, כל מה שנכנס בקביעות"
        action={
          <span className="aurora-settings-count">{incomes.length}</span>
        }
      >
        {incomes.length === 0 ? (
          <EmptyHint text="עדיין לא הוגדרו הכנסות חוזרות." />
        ) : (
          <ul className="aurora-settings-list">
            {incomes.map((i) => (
              <li key={i.id} className="aurora-settings-list-row">
                <div className="aurora-settings-list-body">
                  <span className="aurora-settings-list-title">{i.label}</span>
                  <span className="aurora-settings-list-hint" dir="ltr">
                    {ILS.format(i.amount)} · יום {i.dayOfMonth}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </SettingsCard>

      {/* Notifications */}
      <SettingsCard
        title="התראות וצליל"
        hint="צליל סנכרון רך בכל חיוב חדש"
        action={
          <SwitchToggle
            checked={audioEnabled}
            onChange={(v) => {
              setAudioEnabled(v);
              toast.success(v ? "צליל הופעל" : "צליל הושתק");
            }}
            ariaLabel="צליל סנכרון"
          />
        }
      >
        <span className="aurora-body aurora-ink-3">
          {audioEnabled
            ? "מנוגן כשעסקה חדשה מגיעה דרך SMS / Wallet"
            : "שקט מוחלט. אפשר להפעיל מכאן בכל רגע."}
        </span>
      </SettingsCard>

      {/* Theme */}
      <SettingsCard
        title="ערכת נושא"
        hint="כהה היא ברירת המחדל של Pulse. אוטומטי עוקב אחרי המכשיר."
      >
        <SegmentedRow
          options={THEME_OPTIONS}
          value={theme}
          onChange={(v) => {
            setTheme(v);
            toast.success(`עברנו למצב ${labelFor(THEME_OPTIONS, v)}`);
          }}
          ariaLabel="בחירת ערכת נושא"
        />
      </SettingsCard>

      {/* Text scale */}
      <SettingsCard
        title="גודל טקסט"
        hint="משפיע על כל המסכים — שווה לנסות לפני קביעה."
      >
        <SegmentedRow
          options={TEXT_OPTIONS}
          value={textScale}
          onChange={(v) => {
            setTextScale(v);
            toast.success(`גודל טקסט עודכן ל-${labelFor(TEXT_OPTIONS, v)}`);
          }}
          ariaLabel="בחירת גודל טקסט"
        />
      </SettingsCard>

      {/* Categories */}
      <SettingsCard
        title="קטגוריות"
        hint="כל קטגוריה צובעת תרשימים, כרטיסים וסינונים בכל המסכים."
      >
        <ul className="aurora-cat-grid">
          {CATEGORIES.map((c) => {
            const Icon = c.icon;
            return (
              <li key={c.id} className="aurora-cat-grid-item">
                <span
                  aria-hidden
                  className="aurora-cat-grid-icon"
                  style={{ background: `${c.accent}22`, color: c.accent }}
                >
                  <Icon size={18} />
                </span>
                <span className="aurora-cat-grid-label">{c.label}</span>
              </li>
            );
          })}
        </ul>
      </SettingsCard>

      {/* About */}
      <SettingsCard title="אודות" hint="Pulse · Smart Expense Tracker">
        <div className="aurora-settings-about">
          <Row label="גרסה" value="AURORA v1" />
          <Row label="שפה" value="עברית · RTL" />
          <Row label="מטבע" value="₪ (ILS)" />
          <Row label="מצב נתונים" value={isAuthed ? "ענן" : "מקומי"} />
        </div>
      </SettingsCard>

      <BottomSheet
        open={budgetSheet}
        onOpenChange={setBudgetSheet}
        title="ערוך תקציב חודשי"
        lockDismiss
      >
        <div className="aurora-add-form">
          <label className="aurora-add-amount-row">
            <span className="aurora-add-label">תקציב חודשי</span>
            <div className="aurora-add-amount-wrap">
              <input
                type="text"
                inputMode="decimal"
                dir="ltr"
                placeholder="0"
                className="aurora-add-amount-input"
                value={budgetDraft}
                onChange={(e) =>
                  setBudgetDraft(e.target.value.replace(/[^\d.,]/g, "").slice(0, 9))
                }
                autoFocus
              />
              <span aria-hidden className="aurora-add-amount-currency">
                ₪
              </span>
            </div>
            <span className="aurora-add-hint">
              משפיע על סרגל הבקרה בלבד. חיזוי סוף החודש ממשיך לעבוד גם בלי תקציב מוגדר.
            </span>
          </label>
          <div className="aurora-add-actions">
            <button
              type="button"
              className="aurora-add-ghost"
              onClick={() => setBudgetSheet(false)}
            >
              ביטול
            </button>
            <button
              type="button"
              className="aurora-add-submit"
              style={{ background: "var(--aurora-brand-aurora-2)" }}
              onClick={handleBudgetSave}
            >
              שמור תקציב
            </button>
          </div>
        </div>
      </BottomSheet>
    </div>
  );
}

// ── Atoms ─────────────────────────────────────────────────────────

function SettingsCard({
  title,
  hint,
  action,
  children,
}: {
  title: string;
  hint?: string;
  action?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <GlassCard elevation="elev-1" padding="spacious" radius="hero">
      <div className="aurora-settings-card-head">
        <div className="aurora-settings-card-titles">
          <Eyebrow srHeading={{ level: 3, text: title }}>{title}</Eyebrow>
          {hint ? (
            <span className="aurora-settings-card-hint">{hint}</span>
          ) : null}
        </div>
        {action ? <div className="aurora-settings-card-action">{action}</div> : null}
      </div>
      {children ? (
        <div className="aurora-settings-card-body">{children}</div>
      ) : null}
    </GlassCard>
  );
}

function SegmentedRow<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: Array<{ key: T; label: string }>;
  value: T;
  onChange: (v: T) => void;
  ariaLabel: string;
}) {
  const reduced = useReducedMotion();
  return (
    <div
      className="aurora-segmented"
      role="radiogroup"
      aria-label={ariaLabel}
      style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)` }}
    >
      {options.map((o) => {
        const active = o.key === value;
        return (
          <motion.button
            key={o.key}
            type="button"
            role="radio"
            aria-checked={active}
            className="aurora-seg-option"
            data-aurora-active={active ? "true" : "false"}
            onClick={() => onChange(o.key)}
            whileTap={reduced ? undefined : { scale: 0.98 }}
          >
            {active ? (
              <motion.span
                layoutId={`aurora-seg-${ariaLabel}`}
                aria-hidden
                className="aurora-seg-pill"
                transition={{ type: "spring", stiffness: 380, damping: 30 }}
              />
            ) : null}
            <span className="aurora-seg-label">{o.label}</span>
          </motion.button>
        );
      })}
    </div>
  );
}

function SwitchToggle({
  checked,
  onChange,
  ariaLabel,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={() => onChange(!checked)}
      className="aurora-switch"
      data-aurora-active={checked ? "true" : "false"}
    >
      <motion.span
        aria-hidden
        layout
        className="aurora-switch-thumb"
        transition={{ type: "spring", stiffness: 500, damping: 30 }}
      />
    </button>
  );
}

function EmptyHint({ text }: { text: string }) {
  return (
    <div className="aurora-empty-hint">
      <span aria-hidden className="aurora-empty-glyph" />
      <p className="aurora-body aurora-ink-2">{text}</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="aurora-settings-about-row">
      <span className="aurora-body aurora-ink-3">{label}</span>
      <span className="aurora-body aurora-ink-1">{value}</span>
    </div>
  );
}

function labelFor<T extends string>(
  options: Array<{ key: T; label: string }>,
  v: T,
): string {
  return options.find((o) => o.key === v)?.label ?? String(v);
}
