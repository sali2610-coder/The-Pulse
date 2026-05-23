import { describe, expect, it } from "vitest";

import {
  classifyPushDiagnostic,
  foregroundNote,
  labelFor,
  PROBE_TIMEOUT_MS,
  withTimeout,
} from "@/lib/push-diagnostic-state";

const baseline = {
  pushSupported: true,
  notificationPermission: "granted" as NotificationPermission,
  swRegistered: true,
  swActive: true,
  localEndpoint: "https://push.example/sub",
  serverEndpoint: "https://push.example/sub",
  lastSendOk: null as boolean | null,
  probeTimedOut: false,
};

describe("classifyPushDiagnostic", () => {
  it("timeout always wins", () => {
    expect(
      classifyPushDiagnostic({ ...baseline, probeTimedOut: true }),
    ).toBe("timed_out");
  });

  it("returns unsupported when the browser lacks Push", () => {
    expect(
      classifyPushDiagnostic({ ...baseline, pushSupported: false }),
    ).toBe("unsupported");
  });

  it("permission_denied beats other signals when blocked", () => {
    expect(
      classifyPushDiagnostic({
        ...baseline,
        notificationPermission: "denied",
      }),
    ).toBe("permission_denied");
  });

  it("waiting_for_sw when SW is registered but not active", () => {
    expect(
      classifyPushDiagnostic({ ...baseline, swActive: false }),
    ).toBe("waiting_for_sw");
  });

  it("no_subscription when neither side has a sub", () => {
    expect(
      classifyPushDiagnostic({
        ...baseline,
        localEndpoint: null,
        serverEndpoint: null,
      }),
    ).toBe("no_subscription");
  });

  it("subscribed_browser_only when only the browser has a sub", () => {
    expect(
      classifyPushDiagnostic({
        ...baseline,
        serverEndpoint: null,
      }),
    ).toBe("subscribed_browser_only");
  });

  it("subscribed_server_only when only the server has a record", () => {
    expect(
      classifyPushDiagnostic({
        ...baseline,
        localEndpoint: null,
      }),
    ).toBe("subscribed_server_only");
  });

  it("send_ok / send_failed once both sides have a sub + lastSend resolved", () => {
    expect(
      classifyPushDiagnostic({ ...baseline, lastSendOk: true }),
    ).toBe("send_ok");
    expect(
      classifyPushDiagnostic({ ...baseline, lastSendOk: false }),
    ).toBe("send_failed");
  });

  it("subscribed_synced when both sides match and no send is on file", () => {
    expect(classifyPushDiagnostic(baseline)).toBe("subscribed_synced");
  });
});

describe("labelFor", () => {
  it("returns Hebrew copy for every status", () => {
    for (const s of [
      "idle",
      "checking",
      "unsupported",
      "permission_denied",
      "waiting_for_sw",
      "no_subscription",
      "subscribed_browser_only",
      "subscribed_server_only",
      "subscribed_synced",
      "send_ok",
      "send_failed",
      "timed_out",
    ] as const) {
      const text = labelFor(s);
      expect(typeof text).toBe("string");
      expect(text.length).toBeGreaterThan(0);
    }
  });
});

describe("foregroundNote", () => {
  it("returns a Hebrew explainer for foregrounded iOS PWA", () => {
    const note = foregroundNote({
      visibilityState: "visible",
      standalone: true,
      iosVersion: "17.4",
    });
    expect(note).not.toBeNull();
  });

  it("returns null for non-iOS or non-standalone", () => {
    expect(
      foregroundNote({
        visibilityState: "visible",
        standalone: false,
        iosVersion: "17.4",
      }),
    ).toBeNull();
    expect(
      foregroundNote({
        visibilityState: "visible",
        standalone: true,
        iosVersion: null,
      }),
    ).toBeNull();
  });
});

describe("withTimeout", () => {
  it("resolves ok when promise wins the race", async () => {
    const r = await withTimeout(Promise.resolve(42), 50);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe(42);
  });

  it("resolves failure when the budget expires first", async () => {
    const slow = new Promise((resolve) => setTimeout(() => resolve("late"), 50));
    const r = await withTimeout(slow, 10);
    expect(r.ok).toBe(false);
  });

  it("exposes a default budget under the 5s envelope", () => {
    expect(PROBE_TIMEOUT_MS).toBeLessThanOrEqual(5000);
  });
});
