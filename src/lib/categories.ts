import {
  Utensils,
  Car,
  ShoppingBag,
  Film,
  Receipt,
  HeartPulse,
  GraduationCap,
  Gift,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

export type CategoryId =
  | "food"
  | "transport"
  | "shopping"
  | "entertainment"
  | "bills"
  | "health"
  | "education"
  | "gifts"
  | "other";

export type Category = {
  id: CategoryId;
  label: string;
  icon: LucideIcon;
  accent: string;
};

// Phase 243 — single source of truth for category colors across the
// app. The palette matches the brief: health=pink, car=cyan,
// food=orange, bills=blue, other=gray. Every donut/list/chip reads
// from this list so the user's brain can scan the dashboard fast.
export const CATEGORIES: Category[] = [
  { id: "food", label: "אוכל", icon: Utensils, accent: "#F97316" },
  { id: "transport", label: "תחבורה", icon: Car, accent: "#22D3EE" },
  { id: "shopping", label: "קניות", icon: ShoppingBag, accent: "#FACC15" },
  { id: "entertainment", label: "בילויים", icon: Film, accent: "#A78BFA" },
  { id: "bills", label: "חשבונות", icon: Receipt, accent: "#60A5FA" },
  { id: "health", label: "בריאות", icon: HeartPulse, accent: "#F472B6" },
  { id: "education", label: "חינוך", icon: GraduationCap, accent: "#34D399" },
  { id: "gifts", label: "מתנות", icon: Gift, accent: "#FB7185" },
  { id: "other", label: "אחר", icon: Sparkles, accent: "#94A3B8" },
];

export const CATEGORY_IDS = CATEGORIES.map((c) => c.id) as [
  CategoryId,
  ...CategoryId[],
];

export function getCategory(id: CategoryId): Category {
  const found = CATEGORIES.find((c) => c.id === id);
  if (!found) throw new Error(`Unknown category: ${id}`);
  return found;
}
