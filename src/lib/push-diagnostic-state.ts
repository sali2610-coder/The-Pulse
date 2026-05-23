// Pure state machine for the Tap-to-Pulse diagnostic card.
//
// The previous implementation kept a single `loading` boolean — when
// any of its async probes hung (slow network on iOS, KV timeout,
// suspended SW promise), the spinner stayed forever. This module
// folds every observable signal into one explicit `PushDiagState`
// the UI renders verbatim, so the user always sees a final status
// or a clear "timed out — try again" message.

export type PushDiagStatus =
  | "idle" // never refreshed
  | "checking" // probing now
  | "unsupported" // browser doesn't expose Push / SW APIs
  | "permission_denied" // user explicitly blocked notifications
  | "waiting_for_sw" // SW exists but not active yet
  | "no_subscription" // no server record AND no browser sub
  | "subscribed_browser_only" // browser has sub, server doesn't
  | "subscribed_server_only" // server has record, browser doesn't (needs repair)
  | "subscribed_synced" // browser + server in sync
  | "send_ok" // last test push returned 2xx
  | "send_failed" // last test push failed
  | "timed_out"; // probe exceeded budget

export type PushDiagSignals = {
  pushSupported: boolean;
  notificationPermission: NotificationPermission | "unsupported" | null;
  swRegistered: boolean;
  swActive: boolean;
  localEndpoint: string | null;
  serverEndpoint: string | null;
  lastSendOk: boolean | null;
  /** True when the diagnostic probe timed out (hit the budget without
   *  producing a complete signal set). */
  probeTimedOut: boolean;
};

export function classifyPushDiagnostic(s: PushDiagSignals): PushDiagStatus {
  if (s.probeTimedOut) return "timed_out";
  if (!s.pushSupported) return "unsupported";
  if (s.notificationPermission === "denied") return "permission_denied";
  if (s.swRegistered && !s.swActive) return "waiting_for_sw";

  const hasLocal = Boolean(s.localEndpoint);
  const hasServer = Boolean(s.serverEndpoint);
  if (!hasLocal && !hasServer) return "no_subscription";
  if (hasLocal && !hasServer) return "subscribed_browser_only";
  if (!hasLocal && hasServer) return "subscribed_server_only";

  // Both sides have a sub — last-send outcome breaks the tie.
  if (s.lastSendOk === false) return "send_failed";
  if (s.lastSendOk === true) return "send_ok";
  return "subscribed_synced";
}

const LABELS: Record<PushDiagStatus, string> = {
  idle: "טרם נבדק",
  checking: "בודק...",
  unsupported: "דפדפן זה לא תומך ב-Web Push",
  permission_denied:
    "הרשאת התראות נחסמה. פתח הגדרות → התראות → אפשר.",
  waiting_for_sw: "ה-Service Worker עדיין נטען. רענן בעוד שנייה.",
  no_subscription: "לא נמצא רישום. לחץ הפעל התראות כדי להירשם.",
  subscribed_browser_only:
    "הדפדפן נרשם אך עוד לא דווח לשרת. רענן או הפעל מחדש.",
  subscribed_server_only:
    "השרת מחזיק רישום ישן. השתמש בכפתור ״תקן התראות״.",
  subscribed_synced: "רשום ומסונכרן.",
  send_ok: "ההתראה האחרונה נשלחה בהצלחה.",
  send_failed: "שליחת ההתראה האחרונה נכשלה. נסה ״שלח התראה לבדיקה״.",
  timed_out:
    "אבחון נעצר אחרי זמן ההמתנה. בדוק חיבור או נסה שוב.",
};

export function labelFor(status: PushDiagStatus): string {
  return LABELS[status];
}

/**
 * iOS Safari does NOT fire Web Push notifications while the PWA is in
 * the foreground — instead the SW push event still runs but iOS
 * suppresses the OS-level toast. Show a Hebrew explainer when we know
 * the user is currently foregrounded so they don't read a missing
 * notification as a bug.
 */
export function foregroundNote(args: {
  visibilityState: DocumentVisibilityState;
  standalone: boolean;
  iosVersion?: string | null;
}): string | null {
  if (!args.standalone) return null;
  if (args.visibilityState !== "visible") return null;
  if (!args.iosVersion?.startsWith("16") && !args.iosVersion?.startsWith("17") && !args.iosVersion?.startsWith("18") && !args.iosVersion?.startsWith("19")) {
    return null;
  }
  return "באייפון, התראות לא מוצגות כשהאפליקציה פתוחה בחזית. סגור את האפליקציה לפני בדיקת התראה.";
}

/** Probe budget in ms. Beyond this we mark the diagnostic timed_out. */
export const PROBE_TIMEOUT_MS = 4000;

/** Race a promise against the probe budget. Resolves to `{ ok: true,
 *  value }` or `{ ok: false }` so the caller can fold a partial result
 *  into PushDiagSignals without throwing. */
export async function withTimeout<T>(
  promise: Promise<T>,
  ms: number = PROBE_TIMEOUT_MS,
): Promise<{ ok: true; value: T } | { ok: false }> {
  return Promise.race([
    promise.then((value) => ({ ok: true as const, value })),
    new Promise<{ ok: false }>((resolve) =>
      setTimeout(() => resolve({ ok: false as const }), ms),
    ),
  ]);
}
