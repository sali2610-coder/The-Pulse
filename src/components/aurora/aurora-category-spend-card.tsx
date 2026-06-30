"use client";

// Phase 439 · AURORA recovery — Category Spend card
//
// "לאן הולך הכסף" surface. Premium AURORA rebuild of the legacy
// CategorySpendCard. Reads entirely from existing engine helpers via
// useAuroraCategorySpend — no formulas changed.

import { useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

import { Eyebrow } from "@/components/aurora/aurora-eyebrow";
import { GlassCard } from "@/components/aurora/aurora-glass-card";

import {
  defaultCategoryPresets,
  useAuroraCategorySpend,
  type AuroraCategoryPreset,
  type AuroraCategoryRow,
} from "./use-aurora-category-spend";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});
const PCT = new Intl.NumberFormat("he-IL", {
  style: "percent",
  maximumFractionDigits: 0,
});

export function AuroraCategorySpendCard() {
  const presets = useMemo(() => defaultCategoryPresets(), []);
  const [activeKey, setActiveKey] = useState<AuroraCategoryPreset["key"]>("this");
  const active = presets.find((p) => p.key === activeKey) ?? presets[0];
  const report = useAuroraCategorySpend(active.monthKey);
  const [expandedCat, setExpandedCat] = useState<string | null>(null);

  if (report.rows.length === 0 && report.total === 0) {
    return null;
  }

  return (
    <GlassCard elevation="elev-1" padding="spacious" radius="hero">
      <div className="aurora-card-row-top">
        <Eyebrow srHeading={{ level: 3, text: "לאן הולך הכסף" }}>
          לאן הולך הכסף · {report.monthLabel}
        </Eyebrow>
        <span dir="ltr" className="aurora-cat-total">
          {ILS.format(report.total)}
        </span>
      </div>
      <p className="aurora-body aurora-ink-3" style={{ marginBlockStart: "var(--aurora-space-2)" }}>
        חלוקה לפי קטגוריה. כל קטגוריה מפצלת בין חיובים קבועים להוצאות חד-פעמיות, וניתן לפתוח לרשימה מפורטת.
      </p>

      <SegmentedBar rows={report.rows} />

      <PresetChips
        presets={presets}
        active={activeKey}
        onChange={setActiveKey}
      />

      <ul className="aurora-catspend-list">
        {report.rows.map((row, i) => (
          <CategoryRowView
            key={row.category}
            row={row}
            index={i}
            expanded={expandedCat === row.category}
            onToggle={() =>
              setExpandedCat((prev) => (prev === row.category ? null : row.category))
            }
          />
        ))}
      </ul>
    </GlassCard>
  );
}

function SegmentedBar({ rows }: { rows: AuroraCategoryRow[] }) {
  const reduced = useReducedMotion();
  if (rows.length === 0) return null;
  return (
    <div className="aurora-catspend-bar">
      {rows.map((row, i) => (
        <motion.span
          key={row.category}
          className="aurora-catspend-bar-seg"
          style={{ background: row.accent }}
          initial={reduced ? { flex: row.share } : { flex: 0 }}
          animate={{ flex: row.share }}
          transition={{
            duration: reduced ? 0.12 : 0.5,
            delay: reduced ? 0 : i * 0.04,
            ease: [0.32, 0.72, 0, 1],
          }}
          title={`${row.label} · ${PCT.format(row.share)}`}
        />
      ))}
    </div>
  );
}

function PresetChips({
  presets,
  active,
  onChange,
}: {
  presets: AuroraCategoryPreset[];
  active: AuroraCategoryPreset["key"];
  onChange: (k: AuroraCategoryPreset["key"]) => void;
}) {
  const reduced = useReducedMotion();
  return (
    <div className="aurora-catspend-chips" role="tablist" aria-label="חודש">
      {presets.map((p) => {
        const isActive = p.key === active;
        return (
          <motion.button
            key={p.key}
            type="button"
            role="tab"
            aria-selected={isActive}
            className="aurora-catspend-chip"
            data-aurora-active={isActive ? "true" : "false"}
            onClick={() => onChange(p.key)}
            whileTap={reduced ? undefined : { scale: 0.96 }}
          >
            {p.label}
          </motion.button>
        );
      })}
    </div>
  );
}

function CategoryRowView({
  row,
  index,
  expanded,
  onToggle,
}: {
  row: AuroraCategoryRow;
  index: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  const reduced = useReducedMotion();
  const deltaPct = row.deltaPct;
  const hasDelta = deltaPct !== null;
  const showWarn = hasDelta && Math.abs(deltaPct!) >= 40;
  const showHigh = hasDelta && deltaPct! >= 25;

  return (
    <motion.li
      className="aurora-catspend-row-li"
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 6 }}
      animate={{
        opacity: 1,
        y: 0,
        transition: {
          duration: reduced ? 0.12 : 0.3,
          delay: reduced ? 0 : index * 0.03,
          ease: [0.32, 0.72, 0, 1],
        },
      }}
    >
      <button
        type="button"
        className="aurora-catspend-row"
        onClick={onToggle}
        aria-expanded={expanded}
        style={{ borderColor: `${row.accent}33` }}
      >
        <span
          aria-hidden
          className="aurora-catspend-dot"
          style={{ background: row.accent }}
        />
        <div className="aurora-catspend-body">
          <div className="aurora-catspend-row-head">
            <span className="aurora-catspend-label">{row.label}</span>
            {row.endingCount > 0 ? (
              <span className="aurora-row-badge" data-aurora-tone="info">
                {row.endingCount} מסתיים
              </span>
            ) : null}
            {showWarn ? (
              <span className="aurora-row-badge" data-aurora-tone="watch">
                חריגה
              </span>
            ) : showHigh ? (
              <span className="aurora-row-badge" data-aurora-tone="info">
                גבוה
              </span>
            ) : null}
          </div>
          <span className="aurora-catspend-meta">
            {PCT.format(row.share)} מסך החודש · {row.itemCount} פריטים
          </span>
        </div>
        <div className="aurora-catspend-amount-col">
          <span dir="ltr" className="aurora-catspend-amount">
            {ILS.format(row.amount)}
          </span>
          {hasDelta ? (
            <span
              dir="ltr"
              className="aurora-catspend-delta"
              data-aurora-tone={deltaPct! >= 0 ? "watch" : "safe"}
            >
              {deltaPct! >= 0 ? "↑" : "↓"} {Math.abs(Math.round(deltaPct!))}%
            </span>
          ) : null}
        </div>
        <motion.span
          aria-hidden
          className="aurora-card-row-chevron"
          animate={{ rotate: expanded ? 180 : 0 }}
          transition={{ type: "spring", stiffness: 380, damping: 30 }}
        >
          ▾
        </motion.span>
      </button>

      <AnimatePresence initial={false}>
        {expanded ? (
          <motion.div
            className="aurora-catspend-detail"
            initial={reduced ? { opacity: 0 } : { opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, height: 0 }}
            transition={{ duration: reduced ? 0.12 : 0.28, ease: [0.32, 0.72, 0, 1] }}
          >
            <div className="aurora-catspend-bucket-row">
              <DetailBucket
                label="קבועים"
                amount={row.fixedAmount}
                accent="var(--aurora-brand-aurora-1)"
              />
              <DetailBucket
                label="חד-פעמיים"
                amount={row.oneOffAmount}
                accent="var(--aurora-brand-aurora-2)"
              />
              <DetailBucket
                label="ממוצע 3 חודשים"
                amount={
                  deltaPct === null
                    ? row.amount
                    : Math.round(row.amount / (1 + deltaPct / 100))
                }
                accent="var(--aurora-accent-gold-loud)"
              />
            </div>
            {hasDelta ? (
              <p className="aurora-body aurora-ink-3" style={{ marginBlockStart: "var(--aurora-space-3)" }}>
                {deltaPct! >= 0
                  ? `החודש גבוה ב-${Math.round(deltaPct!)}% מהממוצע של 3 החודשים האחרונים.`
                  : `החודש נמוך ב-${Math.abs(Math.round(deltaPct!))}% מהממוצע של 3 החודשים האחרונים.`}
              </p>
            ) : (
              <p className="aurora-body aurora-ink-3" style={{ marginBlockStart: "var(--aurora-space-3)" }}>
                אין מספיק היסטוריה לקטגוריה זו. נחזור עם השוואה בעוד חודשיים.
              </p>
            )}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.li>
  );
}

function DetailBucket({
  label,
  amount,
  accent,
}: {
  label: string;
  amount: number;
  accent: string;
}) {
  return (
    <div className="aurora-card-bucket" style={{ borderColor: `${accent}55` }}>
      <span className="aurora-card-bucket-label">{label}</span>
      <span dir="ltr" className="aurora-card-bucket-amount" style={{ color: accent }}>
        {ILS.format(amount)}
      </span>
    </div>
  );
}
