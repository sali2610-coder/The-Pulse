"use client";

// Phase 411 — Notifications folder as a mini-app.
//
// Hero status pill summarises the actual Push state. Existing
// toggle cards (PushToggle, IphonePushOnboardingCard, AudioToggle)
// are reused as-is — they already carry premium chrome. Diagnostics
// + delivery matrix collapse under a single disclosure so the rare
// path doesn't crowd the screen.

import { useEffect, useState } from "react";
import { Bell, BellOff } from "lucide-react";

import {
  MiniAppDisclosure,
  MiniAppStatusHero,
} from "@/components/ui/mini-app-shell";
import { PushToggle } from "@/components/settings/push-toggle";
import { IphonePushOnboardingCard } from "@/components/settings/iphone-push-onboarding-card";
import { AudioToggle } from "@/components/settings/audio-toggle";
import { PushDeliveryMatrix } from "@/components/settings/push-delivery-matrix";
import { PushDiagnostics } from "@/components/settings/push-diagnostics";
import { PushDiagnosticsCard } from "@/components/settings/push-diagnostics-card";
import { useFinanceStore } from "@/lib/store";

export function NotificationsMiniApp() {
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(
    "default",
  );
  const audioEnabled = useFinanceStore((s) => s.audioEnabled);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("Notification" in window)) {
      setPermission("unsupported");
      return;
    }
    setPermission(Notification.permission);
    const onFocus = () => {
      if ("Notification" in window) setPermission(Notification.permission);
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  const granted = permission === "granted";
  const tone = granted ? "#34D399" : "#F87171";

  const detail = (() => {
    if (permission === "unsupported") {
      return "הדפדפן הזה לא תומך ב-Web Push.";
    }
    if (permission === "granted") {
      return audioEnabled
        ? "Push פעיל. צליל קצר ינוגן בקליטת חיוב."
        : "Push פעיל. צליל כבוי.";
    }
    if (permission === "denied") {
      return "ההרשאה נחסמה. פתח את הגדרות הדפדפן כדי להפעיל מחדש.";
    }
    return "טרם נשאלה הרשאה. הפעל את Push כדי לקבל התראה לכל חיוב.";
  })();

  return (
    <div className="flex flex-col gap-3" dir="rtl">
      <MiniAppStatusHero
        tone={tone}
        icon={granted ? Bell : BellOff}
        title={granted ? "התראות פעילות" : "התראות כבויות"}
        detail={detail}
      />

      <IphonePushOnboardingCard />
      <PushToggle />
      <AudioToggle />

      <MiniAppDisclosure label="פתרון בעיות + מטריצת אירועים">
        <div className="flex flex-col gap-3">
          <PushDiagnosticsCard />
          <PushDiagnostics />
          <PushDeliveryMatrix />
        </div>
      </MiniAppDisclosure>
    </div>
  );
}
