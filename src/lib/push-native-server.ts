// Server-side native push fan-out.
//
// PHASE 203 — adapter scaffold. Real APNs (HTTP/2 + JWT) and FCM
// (HTTP v1 + service-account JWT) wiring requires credentials that
// aren't provisioned in this environment. Each adapter today returns
// `not_configured` so the caller can transparently fall back to the
// existing Web Push pipeline (src/lib/push-server.ts).
//
// Public surface:
//   sendNativePush({ scope, payload })
//     → { ok, deliveries: NativeDelivery[] }
//
// The fan-out reads every saved native token for the scope, attempts
// platform-specific delivery, and reports per-attempt status. Caller
// (typically the categorize/alert dispatcher) folds Web Push as the
// last leg if native says all delivered fail or `not_configured`.

import type { Scope } from "@/lib/scope";
import { isKvConfigured, listNativePushTokens } from "@/lib/kv";
import type { NativePushToken } from "@/lib/native/push-token";

export type NativePushPayload = Record<string, unknown> & {
  title: string;
  body?: string;
};

export type NativeDeliveryStatus =
  | "delivered"
  | "not_configured"
  | "invalid_token"
  | "failed";

export type NativeDelivery = {
  platform: "ios" | "android";
  status: NativeDeliveryStatus;
  detail?: string;
};

export type NativePushResult = {
  ok: boolean;
  /** True when at least one platform delivered successfully. */
  anyDelivered: boolean;
  deliveries: NativeDelivery[];
  /** Native attempts found no tokens at all. Caller may want to log
   *  it but should not treat as failure on its own — Web Push is the
   *  expected delivery channel for browser-only users. */
  noTokens: boolean;
};

// ────────────────────────────────────────────────────────────────────
// Adapters
// ────────────────────────────────────────────────────────────────────

type Adapter = (args: {
  token: NativePushToken;
  payload: NativePushPayload;
}) => Promise<NativeDelivery>;

const apnsAdapter: Adapter = async (args) => {
  // TODO(phase-204): wire APNs HTTP/2 sender + JWT auth using
  //   APNS_TEAM_ID, APNS_KEY_ID, APNS_PRIVATE_KEY (.p8), APNS_BUNDLE_ID.
  const configured = Boolean(
    process.env.APNS_TEAM_ID &&
      process.env.APNS_KEY_ID &&
      process.env.APNS_PRIVATE_KEY &&
      process.env.APNS_BUNDLE_ID,
  );
  if (!configured) {
    return {
      platform: "ios",
      status: "not_configured",
      detail: "APNs env vars missing (APNS_TEAM_ID / APNS_KEY_ID / APNS_PRIVATE_KEY / APNS_BUNDLE_ID)",
    };
  }
  void args; // adapter is a stub until phase 204
  return {
    platform: "ios",
    status: "failed",
    detail: "APNs sender not implemented in phase 203",
  };
};

const fcmAdapter: Adapter = async (args) => {
  // TODO(phase-204): wire FCM HTTP v1 sender via service-account JWT.
  const configured = Boolean(
    process.env.FCM_PROJECT_ID && process.env.FCM_SERVICE_ACCOUNT_JSON,
  );
  if (!configured) {
    return {
      platform: "android",
      status: "not_configured",
      detail: "FCM env vars missing (FCM_PROJECT_ID / FCM_SERVICE_ACCOUNT_JSON)",
    };
  }
  void args;
  return {
    platform: "android",
    status: "failed",
    detail: "FCM sender not implemented in phase 203",
  };
};

const ADAPTERS: Record<"ios" | "android", Adapter> = {
  ios: apnsAdapter,
  android: fcmAdapter,
};

// ────────────────────────────────────────────────────────────────────
// Public fan-out
// ────────────────────────────────────────────────────────────────────

export async function sendNativePush(args: {
  scope: Scope;
  payload: NativePushPayload;
}): Promise<NativePushResult> {
  // No KV → cannot have any saved native tokens. Caller should still
  // attempt Web Push; we return noTokens=true so shouldFallbackToWebPush
  // routes correctly.
  if (!isKvConfigured()) {
    return { ok: true, anyDelivered: false, deliveries: [], noTokens: true };
  }
  const tokens = await listNativePushTokens(args.scope);
  if (tokens.length === 0) {
    return { ok: true, anyDelivered: false, deliveries: [], noTokens: true };
  }
  const deliveries = await Promise.all(
    tokens.map((t) => ADAPTERS[t.platform]({ token: t, payload: args.payload })),
  );
  const anyDelivered = deliveries.some((d) => d.status === "delivered");
  return {
    ok: true,
    anyDelivered,
    deliveries,
    noTokens: false,
  };
}

/** Caller helper: was the native fan-out fully unproductive? Used by
 *  the categorize dispatcher to decide whether Web Push fallback
 *  should run. */
export function shouldFallbackToWebPush(result: NativePushResult): boolean {
  if (result.noTokens) return true;
  return !result.anyDelivered;
}

/** Test-only adapter override. */
export const _internal = {
  apnsAdapter,
  fcmAdapter,
};
