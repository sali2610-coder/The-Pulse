"use client";

// Home v2 · Outer canvas.
//
// Assembles Signature Hero + Checkpoint Rail (Layer 1) and the calm
// Layer 2 stack. Every drill-down opens a BottomSheet fed by
// existing engine data. No new state, no new engine, no new store.

import { useMemo, useState, type ReactNode } from "react";
import { motion } from "framer-motion";

import { BottomSheet } from "@/components/ui/bottom-sheet";
import { navigateToTab, type TabId } from "@/lib/tab-nav";

import { CategoryList } from "./category-list";
import { CheckpointRail } from "./checkpoint-rail";
import { Eyebrow, Hairline } from "./primitives";
import { HeroCard } from "./hero-card";
import { InsightWhisper } from "./insight-whisper";
import { ObligationsBar } from "./obligations-bar";
import { RecentActivityLedger } from "./recent-activity-ledger";
import { UpcomingList } from "./upcoming-list";
import {
  useHomeData,
  type HomeActivityRow,
  type HomeCheckpoint,
  type HomeData,
  type HomeUpcomingRow,
} from "./use-home-data";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});
const FULL_DATE = new Intl.DateTimeFormat("he-IL", {
  weekday: "long",
  day: "numeric",
  month: "long",
});

type SheetKind =
  | "hero"
  | "checkpoint"
  | "upcoming"
  | "obligations"
  | "categories"
  | "activity"
  | null;

export function HomeCanvas() {
  const data = useHomeData();
  const [sheet, setSheet] = useState<SheetKind>(null);
  const [pickedCheckpoint, setPickedCheckpoint] = useState<
    HomeCheckpoint | null
  >(null);
  const [pickedUpcoming, setPickedUpcoming] = useState<HomeUpcomingRow | null>(
    null,
  );
  const [pickedActivity, setPickedActivity] = useState<HomeActivityRow | null>(
    null,
  );

  const goToTab = (tab: TabId) => {
    navigateToTab(tab);
  };

  const closeSheet = () => {
    setSheet(null);
  };

  const title = useMemo(() => {
    switch (sheet) {
      case "hero":
        return "פירוט יתרה";
      case "checkpoint":
        return pickedCheckpoint?.label ?? "צ׳קפוינט";
      case "upcoming":
        return pickedUpcoming?.label ?? "אירוע קרוב";
      case "obligations":
        return "התחייבויות החודש";
      case "categories":
        return "לאן הולך הכסף";
      case "activity":
        return pickedActivity?.label ?? "פעולה";
      default:
        return "";
    }
  }, [sheet, pickedCheckpoint, pickedUpcoming, pickedActivity]);

  if (!data.ready) {
    return null;
  }

  return (
    <div className="sally-home">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.32, 0.72, 0, 1] }}
      >
        <HeroCard data={data} onOpen={() => setSheet("hero")} />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{
          duration: 0.4,
          delay: 0.04,
          ease: [0.32, 0.72, 0, 1],
        }}
      >
        <CheckpointRail
          data={data}
          onLiveTap={() => setSheet("hero")}
          onCheckpointTap={(cp) => {
            setPickedCheckpoint(cp);
            setSheet("checkpoint");
          }}
        />
      </motion.div>

      <div className="sally-chapter-gap" aria-hidden />

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{
          duration: 0.4,
          delay: 0.08,
          ease: [0.32, 0.72, 0, 1],
        }}
      >
        <UpcomingList
          rows={data.upcoming}
          onRowTap={(row) => {
            setPickedUpcoming(row);
            setSheet("upcoming");
          }}
        />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{
          duration: 0.4,
          delay: 0.12,
          ease: [0.32, 0.72, 0, 1],
        }}
      >
        <ObligationsBar data={data} onOpen={() => setSheet("obligations")} />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{
          duration: 0.4,
          delay: 0.16,
          ease: [0.32, 0.72, 0, 1],
        }}
      >
        <CategoryList
          rows={data.categories}
          onOpen={() => setSheet("categories")}
        />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{
          duration: 0.4,
          delay: 0.2,
          ease: [0.32, 0.72, 0, 1],
        }}
      >
        <RecentActivityLedger
          rows={data.recent}
          onRowTap={(row) => {
            setPickedActivity(row);
            setSheet("activity");
          }}
        />
      </motion.div>

      {data.insight ? (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: 0.4,
            delay: 0.24,
            ease: [0.32, 0.72, 0, 1],
          }}
        >
          <InsightWhisper
            insight={data.insight}
            onOpen={() => goToTab("setup")}
          />
        </motion.div>
      ) : null}

      <div className="sally-bottom-breather" aria-hidden />

      <BottomSheet
        open={sheet !== null}
        onOpenChange={(o) => (o ? null : closeSheet())}
        title={title}
      >
        <SheetBody
          data={data}
          sheet={sheet}
          checkpoint={pickedCheckpoint}
          upcoming={pickedUpcoming}
          activity={pickedActivity}
        />
      </BottomSheet>
    </div>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="sally-sheet-row">
      <span className="sally-sheet-row-label">{label}</span>
      <span className="sally-sheet-row-value">{value}</span>
    </div>
  );
}

function SheetBody({
  data,
  sheet,
  checkpoint,
  upcoming,
  activity,
}: {
  data: HomeData;
  sheet: SheetKind;
  checkpoint: HomeCheckpoint | null;
  upcoming: HomeUpcomingRow | null;
  activity: HomeActivityRow | null;
}) {
  if (!sheet) return null;
  if (sheet === "hero") {
    return (
      <div className="sally-sheet-stack">
        <Eyebrow accent>פירוט יתרה</Eyebrow>
        <div className="sally-sheet-list">
          <Row label="יתרה חיה" value={<span dir="ltr">{ILS.format(data.live)}</span>} />
          <Row
            label="צפי סוף החודש"
            value={
              <span
                dir="ltr"
                data-aurora-tone={
                  data.safetyState === "stress"
                    ? "danger"
                    : data.safetyState === "watch"
                      ? "watch"
                      : "ink"
                }
              >
                {ILS.format(data.eom)}
              </span>
            }
          />
          <Row label="יעד חודשי" value={<span dir="ltr">{data.eomBudget > 0 ? ILS.format(data.eomBudget) : "—"}</span>} />
          <Row label="מצב" value={data.safetyLabel} />
        </div>
      </div>
    );
  }
  if (sheet === "checkpoint" && checkpoint) {
    return (
      <div className="sally-sheet-stack">
        <Eyebrow accent>{checkpoint.label}</Eyebrow>
        <div className="sally-sheet-list">
          <Row
            label="יתרה צפויה"
            value={
              <span dir="ltr">
                {checkpoint.amount < 0 ? "−" : ""}
                {ILS.format(Math.abs(checkpoint.amount))}
              </span>
            }
          />
          <Row label="מתי" value={FULL_DATE.format(new Date(checkpoint.whenISO))} />
          <Row
            label="ימים"
            value={
              checkpoint.daysUntil === 0
                ? "עכשיו"
                : `+${checkpoint.daysUntil} ימים`
            }
          />
        </div>
        <Hairline />
        <p className="sally-sheet-note">
          מנוע התחזית של סאלי משקלל משכורות, הלוואות וחיובי כרטיסים עד התאריך הזה.
        </p>
      </div>
    );
  }
  if (sheet === "upcoming" && upcoming) {
    return (
      <div className="sally-sheet-stack">
        <Eyebrow accent>{upcoming.daysLabel}</Eyebrow>
        <div className="sally-sheet-list">
          <Row label="שם" value={upcoming.label} />
          <Row
            label="סכום"
            value={
              <span dir="ltr" data-aurora-tone={upcoming.direction === "in" ? "safe" : "ink"}>
                {upcoming.direction === "in" ? "+" : "−"}
                {ILS.format(upcoming.amount)}
              </span>
            }
          />
          <Row label="מתי" value={FULL_DATE.format(new Date(upcoming.whenISO))} />
          <Row label="סוג" value={
            upcoming.kind === "income"
              ? "הכנסה"
              : upcoming.kind === "loan"
                ? "הלוואה"
                : upcoming.kind === "card"
                  ? "חיוב כרטיס"
                  : "חיוב בנק"
          } />
        </div>
      </div>
    );
  }
  if (sheet === "obligations") {
    return (
      <div className="sally-sheet-stack">
        <Eyebrow accent>התחייבויות · {data.monthLabel}</Eyebrow>
        <div className="sally-sheet-list">
          <Row label="סך הכל" value={<span dir="ltr">{ILS.format(data.obligations.total)}</span>} />
          {data.obligations.lanes.map((lane) => (
            <Row
              key={lane.key}
              label={lane.label}
              value={<span dir="ltr">{ILS.format(lane.amount)}</span>}
            />
          ))}
        </div>
      </div>
    );
  }
  if (sheet === "categories") {
    return (
      <div className="sally-sheet-stack">
        <Eyebrow accent>לאן הולך הכסף</Eyebrow>
        <div className="sally-sheet-list">
          {data.categories.map((row) => (
            <Row
              key={row.id}
              label={row.label}
              value={<span dir="ltr">{ILS.format(row.amount)}</span>}
            />
          ))}
        </div>
      </div>
    );
  }
  if (sheet === "activity" && activity) {
    return (
      <div className="sally-sheet-stack">
        <Eyebrow accent>{activity.metaLabel}</Eyebrow>
        <div className="sally-sheet-list">
          <Row label="שם" value={activity.label} />
          <Row
            label="סכום"
            value={
              <span dir="ltr" data-aurora-tone={activity.direction === "in" ? "safe" : "ink"}>
                {activity.direction === "in" ? "+" : "−"}
                {ILS.format(activity.amount)}
              </span>
            }
          />
          <Row label="מתי" value={FULL_DATE.format(new Date(activity.whenISO))} />
        </div>
      </div>
    );
  }
  return null;
}
