"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CalendarClock } from "lucide-react";

import { useFinanceStore } from "@/lib/store";
import { buildBillingCalendar } from "@/lib/billing-calendar";
import { currentMonthKey } from "@/lib/dates";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

const HEBREW_MONTH = [
  "ינואר",
  "פברואר",
  "מרץ",
  "אפריל",
  "מאי",
  "יוני",
  "יולי",
  "אוגוסט",
  "ספטמבר",
  "אוקטובר",
  "נובמבר",
  "דצמבר",
];

function monthHeading(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  if (!y || !m) return monthKey;
  return `${HEBREW_MONTH[m - 1]} ${y}`;
}

/**
 * Day-of-month grid of committed recurring outflows (rules + loans).
 * Renders nothing when nothing is scheduled. Each cell shows the day
 * number; a colored dot under it means at least one bill fires that
 * day. Tap a cell to expand and see the list.
 *
 * Compact 7-column grid mirrors a real calendar without trying to
 * align day-of-week, so the layout works for any month.
 */
export function BillingCalendarCard() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const rules = useFinanceStore((s) => s.rules);
  const loans = useFinanceStore((s) => s.loans);
  const statuses = useFinanceStore((s) => s.statuses);

  const monthKey = currentMonthKey();
  const today = new Date().getDate();
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  const calendar = useMemo(() => {
    if (!hydrated) return [];
    return buildBillingCalendar({ rules, loans, statuses, monthKey });
  }, [hydrated, rules, loans, statuses, monthKey]);

  if (!hydrated) return null;
  const totalThisMonth = calendar.reduce((s, d) => s + d.total, 0);
  if (totalThisMonth === 0) return null;

  const selected = selectedDay
    ? calendar.find((d) => d.day === selectedDay) ?? null
    : null;

  return (
    <section className="glass-card flex flex-col gap-3 rounded-3xl p-4">
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex size-9 items-center justify-center rounded-xl bg-gold/15 text-gold">
            <CalendarClock className="size-4" strokeWidth={1.8} />
          </span>
          <div className="flex flex-col leading-tight">
            <span className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
              לוח חיובים קבועים
            </span>
            <span className="text-[11.5px] text-muted-foreground">
              {monthHeading(monthKey)} · קבועים + הלוואות
            </span>
          </div>
        </div>
        <span
          data-mono="true"
          dir="ltr"
          className="text-[14px] font-semibold text-foreground"
        >
          {ILS.format(totalThisMonth)}
        </span>
      </header>

      <div className="grid grid-cols-7 gap-1">
        {calendar.map((d) => {
          const hasItems = d.items.length > 0;
          const isToday = d.day === today;
          const isSelected = d.day === selectedDay;
          const hasPaid = d.items.some((i) => i.status === "paid");
          const dotTone = hasPaid && d.items.every((i) => i.status === "paid")
            ? "#34D399"
            : "#D4AF37";
          return (
            <button
              key={d.day}
              type="button"
              onClick={() =>
                setSelectedDay((cur) =>
                  cur === d.day ? null : hasItems ? d.day : null,
                )
              }
              disabled={!hasItems}
              className={`flex flex-col items-center justify-center gap-1 rounded-lg border px-1 py-1.5 text-[10.5px] transition-colors ${
                isSelected
                  ? "border-neon/60 bg-neon/10 text-foreground"
                  : hasItems
                    ? "border-white/10 bg-black/30 text-foreground hover:border-white/20"
                    : "border-white/4 bg-black/15 text-muted-foreground/60"
              } ${isToday ? "ring-1 ring-neon/40" : ""}`}
              dir="ltr"
            >
              <span className="text-[11px] font-medium" data-mono="true">
                {d.day}
              </span>
              {hasItems ? (
                <span
                  className="size-1.5 rounded-full"
                  style={{ background: dotTone }}
                />
              ) : (
                <span className="size-1.5" />
              )}
            </button>
          );
        })}
      </div>

      <AnimatePresence initial={false}>
        {selected ? (
          <motion.div
            key={selected.day}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden rounded-2xl border border-white/8 bg-black/30 p-2.5"
          >
            <div className="mb-1.5 flex items-center justify-between text-[10px] text-muted-foreground">
              <span data-mono="true">
                יום {selected.day} · {selected.items.length} פריטים
              </span>
              <span data-mono="true" dir="ltr">
                {ILS.format(selected.total)}
              </span>
            </div>
            <ul className="flex flex-col gap-1">
              {selected.items.map((item) => (
                <li
                  key={`${item.kind}:${item.id}`}
                  className="flex items-center justify-between gap-2 rounded-lg border border-white/6 bg-background/30 px-2 py-1.5 text-[11.5px]"
                >
                  <span className="flex items-center gap-1.5">
                    <span
                      className="rounded-full px-1.5 py-0.5 text-[9px]"
                      style={{
                        background:
                          item.kind === "loan" ? "#A78BFA22" : "#D4AF3722",
                        color:
                          item.kind === "loan" ? "#A78BFA" : "#D4AF37",
                      }}
                    >
                      {item.kind === "loan" ? "הלוואה" : "קבוע"}
                    </span>
                    <span className="truncate text-foreground">
                      {item.label}
                    </span>
                  </span>
                  <span className="flex items-center gap-1">
                    {item.status === "paid" ? (
                      <span className="text-[9px] text-[#34D399]">שולם</span>
                    ) : null}
                    <span
                      data-mono="true"
                      dir="ltr"
                      className="font-semibold text-foreground"
                    >
                      {ILS.format(item.amount)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  );
}
