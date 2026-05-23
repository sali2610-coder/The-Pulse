"use client";

// Semantic wrapper around InsightChip for confidence ratings. Keeps
// the call sites short ("<ConfidenceChip level=... />") and ensures
// every card maps the same level → tone so a HIGH chip on one card
// never looks like a WARN on another.

import {
  InsightChip,
  type InsightSeverity,
} from "@/components/ui/insight-chip";
import type { ConfidenceLevel } from "@/lib/confidence";

const LABEL: Record<ConfidenceLevel, string> = {
  high: "אמינות גבוהה",
  medium: "אמינות בינונית",
  low: "אמינות נמוכה",
};

const SEV: Record<ConfidenceLevel, InsightSeverity> = {
  high: "info",
  medium: "watch",
  low: "warn",
};

export function ConfidenceChip({ level }: { level: ConfidenceLevel }) {
  return <InsightChip severity={SEV[level]} label={LABEL[level]} />;
}
