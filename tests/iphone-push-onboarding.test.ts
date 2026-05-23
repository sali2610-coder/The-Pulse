import { describe, expect, it } from "vitest";

import {
  iphonePushOnboardingReport,
  type IphoneOnboardingInput,
} from "@/lib/iphone-push-onboarding";

const BASELINE: IphoneOnboardingInput = {
  isIOS: true,
  isStandalone: false,
  notificationPermission: "default",
  hasSubscription: false,
  isForeground: false,
};

function step(report: ReturnType<typeof iphonePushOnboardingReport>, kind: string) {
  return report.steps.find((s) => s.kind === kind)!;
}

describe("iphonePushOnboardingReport", () => {
  it("marks install_pwa as current on iOS before install", () => {
    const r = iphonePushOnboardingReport(BASELINE);
    expect(step(r, "install_pwa").status).toBe("current");
    expect(step(r, "notification_permission").status).toBe("pending");
    expect(step(r, "push_subscription").status).toBe("pending");
    expect(r.headerLabel).toBe("ממתין להשלמה");
  });

  it("advances permission to current once standalone", () => {
    const r = iphonePushOnboardingReport({
      ...BASELINE,
      isStandalone: true,
    });
    expect(step(r, "install_pwa").status).toBe("done");
    expect(step(r, "notification_permission").status).toBe("current");
  });

  it("flips permission to blocked when denied", () => {
    const r = iphonePushOnboardingReport({
      ...BASELINE,
      isStandalone: true,
      notificationPermission: "denied",
    });
    expect(step(r, "notification_permission").status).toBe("blocked");
    expect(r.headerLabel).toBe("צריך התערבות");
  });

  it("subscription becomes current once permission granted but no sub yet", () => {
    const r = iphonePushOnboardingReport({
      ...BASELINE,
      isStandalone: true,
      notificationPermission: "granted",
    });
    expect(step(r, "push_subscription").status).toBe("current");
  });

  it("allReady=true once every step is done", () => {
    const r = iphonePushOnboardingReport({
      ...BASELINE,
      isStandalone: true,
      notificationPermission: "granted",
      hasSubscription: true,
    });
    expect(r.allReady).toBe(true);
    expect(r.headerLabel).toBe("התראות מוכנות");
  });

  it("marks ios_safari as skipped on non-iOS", () => {
    const r = iphonePushOnboardingReport({
      ...BASELINE,
      isIOS: false,
      isStandalone: true,
      notificationPermission: "granted",
      hasSubscription: true,
    });
    expect(step(r, "ios_safari").status).toBe("skipped");
    expect(r.allReady).toBe(true);
  });

  it("emits foregroundNote only when iOS + standalone + foreground + ready", () => {
    const ready = iphonePushOnboardingReport({
      ...BASELINE,
      isStandalone: true,
      notificationPermission: "granted",
      hasSubscription: true,
      isForeground: true,
    });
    expect(ready.foregroundNote).not.toBeNull();
    // not foreground → no note
    const bg = iphonePushOnboardingReport({
      ...BASELINE,
      isStandalone: true,
      notificationPermission: "granted",
      hasSubscription: true,
      isForeground: false,
    });
    expect(bg.foregroundNote).toBeNull();
    // not iOS → no note
    const desktop = iphonePushOnboardingReport({
      ...BASELINE,
      isIOS: false,
      isStandalone: true,
      notificationPermission: "granted",
      hasSubscription: true,
      isForeground: true,
    });
    expect(desktop.foregroundNote).toBeNull();
  });

  it("unsupported / null permission becomes blocked with explainer", () => {
    const r = iphonePushOnboardingReport({
      ...BASELINE,
      isStandalone: true,
      notificationPermission: "unsupported",
    });
    expect(step(r, "notification_permission").status).toBe("blocked");
    expect(step(r, "notification_permission").hint).toContain("16.4");
  });
});
