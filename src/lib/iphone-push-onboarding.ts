// iPhone PWA Web Push onboarding state machine.
//
// Walks the four checks an iPhone user needs to satisfy to actually
// receive a Web Push notification:
//
//   1. Open in Safari on iOS (or compatible browser — Chrome on iOS
//      uses the same engine and works once installed).
//   2. Install via "Add to Home Screen" so the page runs as a
//      standalone PWA. iOS Safari refuses pushManager.subscribe()
//      otherwise.
//   3. Grant notification permission (must be triggered from a user
//      gesture inside the PWA).
//   4. Have a live PushSubscription registered on this device AND a
//      matching server-side record.
//
// Pure module. No store, no React. The UI consumes the typed report
// and renders the per-step copy.

export type IphoneStepStatus =
  | "done"
  | "current"
  | "pending"
  | "blocked"
  | "skipped";

export type IphoneStepKind =
  | "ios_safari"
  | "install_pwa"
  | "notification_permission"
  | "push_subscription";

export type IphoneStep = {
  kind: IphoneStepKind;
  title: string;
  description: string;
  status: IphoneStepStatus;
  /** Optional Hebrew action hint shown under the step. */
  hint?: string;
};

export type IphoneOnboardingInput = {
  isIOS: boolean;
  /** True when running as standalone (display-mode standalone OR
   *  navigator.standalone). */
  isStandalone: boolean;
  notificationPermission: NotificationPermission | "unsupported" | null;
  hasSubscription: boolean;
  /** True when the app is currently visible. Drives the
   *  iOS-foreground explainer. */
  isForeground: boolean;
};

export type IphoneOnboardingReport = {
  steps: IphoneStep[];
  /** True when the user has completed every step. */
  allReady: boolean;
  /** Pretty Hebrew status label for the card header. */
  headerLabel: string;
  /** Optional Hebrew explainer when the user is foregrounded — iOS
   *  suppresses the OS-level toast in that state even with a valid
   *  subscription. Null when the explainer isn't applicable. */
  foregroundNote: string | null;
};

export function iphonePushOnboardingReport(
  input: IphoneOnboardingInput,
): IphoneOnboardingReport {
  const steps: IphoneStep[] = [];

  // 1. Safari on iOS — non-iOS browsers still get Web Push, but the
  //    add-to-home-screen step is iOS-specific. We mark this "skipped"
  //    when not on iOS so the rest of the flow continues cleanly.
  steps.push({
    kind: "ios_safari",
    title: "Safari על iPhone",
    description:
      "Web Push באייפון עובד דרך Safari + הפעלת האפליקציה כ-PWA.",
    status: input.isIOS ? "done" : "skipped",
    hint: input.isIOS ? undefined : "אתה לא על iOS — הצעדים הבאים עדיין רלוונטיים.",
  });

  // 2. Install via Add to Home Screen.
  const installStatus: IphoneStepStatus = input.isStandalone
    ? "done"
    : input.isIOS
      ? "current"
      : "pending";
  steps.push({
    kind: "install_pwa",
    title: "הוספה למסך הבית",
    description: input.isIOS
      ? `פתח את הדף ב-Safari → לחץ על אייקון השיתוף → "Add to Home Screen". בלי זה, iOS לא ייתן הרשאת התראות.`
      : "במכשירים שאינם iOS: התקן את ה-PWA דרך תפריט הדפדפן (Install app).",
    status: installStatus,
    hint:
      installStatus === "done"
        ? "מצוין — האפליקציה רצה כ-standalone PWA."
        : "בלי התקנה כ-PWA, iOS לא מציג חלון בקשת הרשאה.",
  });

  // 3. Notification permission. iOS will refuse the prompt entirely
  //    until the user has installed the PWA, so this stays "pending"
  //    until install is "done".
  let permStatus: IphoneStepStatus;
  let permHint: string | undefined;
  switch (input.notificationPermission) {
    case "granted":
      permStatus = "done";
      permHint = "ההרשאה הוענקה.";
      break;
    case "denied":
      permStatus = "blocked";
      permHint =
        "ההרשאה נדחתה. iOS Settings → Notifications → Sally → Allow.";
      break;
    case "default":
      permStatus = installStatus === "done" ? "current" : "pending";
      permHint =
        installStatus === "done"
          ? "לחץ ״הפעל התראות״ בכרטיס הראשי כדי לבקש הרשאה."
          : "השלם קודם את ההתקנה.";
      break;
    case "unsupported":
    case null:
    default:
      permStatus = "blocked";
      permHint = "הדפדפן הזה לא חושף Notification API. iOS דורש 16.4+.";
      break;
  }
  steps.push({
    kind: "notification_permission",
    title: "הרשאת התראות",
    description: "אישור מ-iOS להציג התראות מהאפליקציה.",
    status: permStatus,
    hint: permHint,
  });

  // 4. Live push subscription.
  let subStatus: IphoneStepStatus;
  let subHint: string | undefined;
  if (permStatus !== "done") {
    subStatus = "pending";
    subHint = "נדרשת הרשאה לפני שניתן להירשם.";
  } else if (input.hasSubscription) {
    subStatus = "done";
    subHint = "iPhone זה רשום ומקבל התראות מהשרת.";
  } else {
    subStatus = "current";
    subHint = "לחץ ״הפעל התראות״ ליצירת רישום חדש.";
  }
  steps.push({
    kind: "push_subscription",
    title: "רישום למנגנון Push",
    description: "iPhone יוצר מפתח ייחודי שמאפשר לשרת לשלוח התראות.",
    status: subStatus,
    hint: subHint,
  });

  const allReady = steps
    .filter((s) => s.status !== "skipped")
    .every((s) => s.status === "done");

  const headerLabel = allReady
    ? "התראות מוכנות"
    : steps.some((s) => s.status === "blocked")
      ? "צריך התערבות"
      : "ממתין להשלמה";

  const foregroundNote =
    input.isStandalone && input.isForeground && input.isIOS && allReady
      ? "באייפון, התראות לא מוצגות כשהאפליקציה פתוחה בחזית. סגור את האפליקציה לפני בדיקת התראה."
      : null;

  return {
    steps,
    allReady,
    headerLabel,
    foregroundNote,
  };
}
