// Phase 263 — pure reconcile decision for budget settings.
//
// Extracted from useCloudSync so the rules can be exhaustively
// tested without mounting the hook. The reconcile decides three
// things for each pull from the cloud:
//   • apply  — what to setState into the local store
//   • push   — what to upsert to Supabase
//   • neither — when both sides already agree
//
// Critical invariants this codifies:
//   1. Local "default" (budgetSettingsUpdatedAt === 0) NEVER pushes
//      to cloud. That was the reinstall bug — fresh-install
//      "manual" default was overwriting a previously-saved "auto".
//   2. Cloud `undefined` means "no opinion" — apply only when local
//      is also default.
//   3. Within `LOCAL_RECENT_MS`, the user just touched the toggle
//      locally; the debounced cloud push may not have landed yet.
//      Local wins → push to cloud.
//   4. monthlyBudget === 0 in auto mode is VALID and must not be
//      treated as "no opinion": the timestamp is the discriminator.

export type LocalSettings = {
  monthlyBudget: number;
  budgetMode: "manual" | "auto";
  budgetSafetyBuffer: number;
  budgetSettingsUpdatedAt: number;
};

export type CloudSettings = {
  monthlyBudget: number;
  budgetMode?: "manual" | "auto";
  budgetSafetyBuffer?: number;
};

export type ReconcileDecision = {
  applyLocal: Partial<LocalSettings>;
  pushCloud: {
    monthlyBudget: number;
    budgetMode: "manual" | "auto";
    budgetSafetyBuffer: number;
  } | null;
};

export const LOCAL_RECENT_MS = 5 * 60 * 1000;

export function reconcileBudgetSettings(args: {
  local: LocalSettings;
  cloud: CloudSettings;
  ownershipMismatch?: boolean;
  now?: number;
}): ReconcileDecision {
  const { local, cloud } = args;
  const ownershipMismatch = args.ownershipMismatch === true;
  const now = args.now ?? Date.now();
  const cloudHasMode = cloud.budgetMode !== undefined;
  const cloudHasBuffer = typeof cloud.budgetSafetyBuffer === "number";
  const localOpinionated = local.budgetSettingsUpdatedAt > 0;
  const localRecent =
    localOpinionated && now - local.budgetSettingsUpdatedAt < LOCAL_RECENT_MS;

  const applyLocal: Partial<LocalSettings> = {};
  let pushCloud: ReconcileDecision["pushCloud"] = null;

  function schedulePush() {
    pushCloud = {
      monthlyBudget: local.monthlyBudget,
      budgetMode: local.budgetMode,
      budgetSafetyBuffer: local.budgetSafetyBuffer,
    };
  }

  // monthlyBudget reconcile.
  if (cloud.monthlyBudget > 0) {
    if (cloud.monthlyBudget !== local.monthlyBudget && !localRecent) {
      applyLocal.monthlyBudget = cloud.monthlyBudget;
    } else if (localRecent && cloud.monthlyBudget !== local.monthlyBudget) {
      schedulePush();
    }
  } else if (
    local.monthlyBudget > 0 &&
    localOpinionated &&
    !ownershipMismatch
  ) {
    schedulePush();
  }

  // budgetMode reconcile.
  if (cloudHasMode && cloud.budgetMode !== local.budgetMode) {
    if (localRecent && !ownershipMismatch) {
      schedulePush();
    } else {
      applyLocal.budgetMode = cloud.budgetMode;
      // Bump the local timestamp so a follow-up reconcile doesn't
      // treat the cloud-applied value as user-set.
      applyLocal.budgetSettingsUpdatedAt =
        local.budgetSettingsUpdatedAt || now;
    }
  } else if (!cloudHasMode && localOpinionated && !ownershipMismatch) {
    schedulePush();
  }

  // budgetSafetyBuffer reconcile.
  if (cloudHasBuffer && cloud.budgetSafetyBuffer !== local.budgetSafetyBuffer) {
    if (localRecent && !ownershipMismatch) {
      schedulePush();
    } else {
      applyLocal.budgetSafetyBuffer = cloud.budgetSafetyBuffer;
    }
  } else if (!cloudHasBuffer && localOpinionated && !ownershipMismatch) {
    // No-op: budgetMode push above already carries the buffer when
    // it fires. Avoid double-pushing on a setting that hasn't
    // diverged from cloud.
  }

  return { applyLocal, pushCloud };
}
