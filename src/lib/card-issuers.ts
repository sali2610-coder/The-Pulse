// Card issuer registry.
//
// Single source of truth for the dropdown options, display labels,
// and brand-ish accent colors. Adding a new issuer = appending one
// entry here. No other file needs to change.
//
// Issuer ids are stable strings (lower-case, no spaces) so they stay
// safe to persist across users + serialization formats. Hebrew
// labels are display-only.

import type { Issuer } from "@/types/finance";

export type IssuerMeta = {
  id: Issuer;
  label: string;
  accent: string;
};

export const ISSUERS: IssuerMeta[] = [
  { id: "cal", label: "כאל", accent: "#3B82F6" },
  { id: "max", label: "MAX", accent: "#9333EA" },
  { id: "isracard", label: "ישראכרט", accent: "#EF4444" },
  { id: "amex", label: "אמריקן אקספרס", accent: "#0EA5E9" },
  { id: "hapoalim", label: "הפועלים", accent: "#DC2626" },
  { id: "leumi", label: "לאומי", accent: "#1D4ED8" },
  { id: "discount", label: "דיסקונט", accent: "#16A34A" },
  { id: "mizrahi", label: "מזרחי טפחות", accent: "#EA580C" },
  { id: "fibi", label: "הבינלאומי", accent: "#0F766E" },
  { id: "visa", label: "Visa", accent: "#1A1F71" },
  { id: "mastercard", label: "Mastercard", accent: "#EB001B" },
  { id: "other", label: "אחר", accent: "#A1A1AA" },
];

const ISSUER_MAP = new Map(ISSUERS.map((i) => [i.id, i]));

export function getIssuerMeta(id: Issuer | undefined): IssuerMeta {
  if (id && ISSUER_MAP.has(id)) return ISSUER_MAP.get(id)!;
  return { id: "other", label: "אחר", accent: "#A1A1AA" };
}
