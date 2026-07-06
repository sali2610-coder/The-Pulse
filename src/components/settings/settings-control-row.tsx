"use client";

// Settings · compact control row (3 tiles).
//
// UI/UX-only refactor. Replaces the big TextSizeCard + ThemeCard +
// AuthCard stack at the top of the Settings tab with three small
// glass tiles that open dedicated BottomSheets on tap. Each sheet
// mounts the EXISTING card component byte-for-byte, so every hook,
// persistence path, Supabase call, and text-scale write remains
// exactly as it was — this file only reshapes the surface.

import { useState } from "react";
import { motion } from "framer-motion";
import {
  ChevronLeft,
  Moon,
  Palette,
  Sun,
  SunMoon,
  Type,
  UserCircle2,
} from "lucide-react";

import { BottomSheet } from "@/components/ui/bottom-sheet";
import { AuthCard } from "@/components/settings/auth-card";
import { TextSizeCard } from "@/components/settings/text-size-card";
import { ThemeCard } from "@/components/settings/theme-card";
import { useTextScale, type TextScale } from "@/lib/use-text-scale";
import { useFinanceStore } from "@/lib/store";
import { tap as hapticTap } from "@/lib/haptics";

type Sheet = "text" | "theme" | "account" | null;

const TEXT_LABEL: Record<TextScale, string> = {
  compact: "קומפקטי",
  normal: "רגיל",
  large: "גדול",
};

type ThemeId = "dark" | "light" | "auto";
const THEME_LABEL: Record<ThemeId, string> = {
  dark: "לילה",
  light: "יום",
  auto: "אוטומטי",
};
const THEME_ICON: Record<ThemeId, React.ReactNode> = {
  dark: <Moon className="size-3.5" />,
  light: <Sun className="size-3.5" />,
  auto: <SunMoon className="size-3.5" />,
};

export function SettingsControlRow() {
  const [sheet, setSheet] = useState<Sheet>(null);
  const { scale } = useTextScale();
  const theme = useFinanceStore((s) => s.theme) as ThemeId;

  function open(next: Sheet) {
    hapticTap();
    setSheet(next);
  }

  return (
    <>
      <div className="sc-row" role="toolbar" aria-label="בקרות מהירות">
        <ControlTile
          icon={<Type className="size-4" />}
          label="טקסט"
          value={TEXT_LABEL[scale]}
          onClick={() => open("text")}
          tone="gold"
        />
        <ControlTile
          icon={<Palette className="size-4" />}
          label="תצוגה"
          value={THEME_LABEL[theme] ?? "לילה"}
          valueLeading={THEME_ICON[theme]}
          onClick={() => open("theme")}
          tone="cyan"
        />
        <ControlTile
          icon={<UserCircle2 className="size-4" />}
          label="חשבון"
          value="פרטים"
          onClick={() => open("account")}
          tone="purple"
        />
      </div>

      <BottomSheet
        open={sheet === "text"}
        onOpenChange={(o) => setSheet(o ? "text" : null)}
        title="גודל טקסט"
        className="sc-sheet"
      >
        <div className="sc-sheet-body" dir="rtl">
          <TextSizeCard />
        </div>
      </BottomSheet>

      <BottomSheet
        open={sheet === "theme"}
        onOpenChange={(o) => setSheet(o ? "theme" : null)}
        title="מצב תצוגה"
        className="sc-sheet"
      >
        <div className="sc-sheet-body" dir="rtl">
          <ThemeCard />
        </div>
      </BottomSheet>

      <BottomSheet
        open={sheet === "account"}
        onOpenChange={(o) => setSheet(o ? "account" : null)}
        title="חשבון"
        className="sc-sheet"
      >
        <div className="sc-sheet-body" dir="rtl">
          <AuthCard />
        </div>
      </BottomSheet>
    </>
  );
}

function ControlTile({
  icon,
  label,
  value,
  valueLeading,
  onClick,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  valueLeading?: React.ReactNode;
  onClick: () => void;
  tone: "gold" | "cyan" | "purple";
}) {
  return (
    <motion.button
      type="button"
      className="sc-tile"
      data-tone={tone}
      onClick={onClick}
      whileTap={{ scale: 0.97 }}
      transition={{ type: "spring", stiffness: 380, damping: 34 }}
      aria-label={`${label} · ${value}`}
    >
      <span aria-hidden className="sc-tile-icon">
        {icon}
      </span>
      <div className="sc-tile-text">
        <span className="sc-tile-label">{label}</span>
        <span className="sc-tile-value">
          {valueLeading ? (
            <span aria-hidden className="sc-tile-value-lead">
              {valueLeading}
            </span>
          ) : null}
          {value}
        </span>
      </div>
      <span aria-hidden className="sc-tile-cue">
        <ChevronLeft className="size-3.5" />
      </span>
    </motion.button>
  );
}
