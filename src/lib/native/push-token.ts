// Native push token model + validator.
//
// Pure module. No I/O. Shared between the client registration code
// (src/lib/native/push.ts) and the server route
// (/api/push/subscribe-native) so both sides agree on the wire shape.

import { z } from "zod";

export type NativePlatform = "ios" | "android";

export type NativePushToken = {
  platform: NativePlatform;
  token: string;
  deviceId: string;
  userId?: string;
  appVersion?: string;
  createdAt: string;
  updatedAt: string;
};

// APNs hex tokens: 64 chars. FCM tokens: variable (typically 140-200
// chars, base64-ish). Cap at 4096 so a malformed sender can't blow
// the request budget.
const TOKEN_RE = /^[A-Za-z0-9_\-:.]{16,4096}$/;

export const nativePushTokenInputSchema = z.object({
  platform: z.enum(["ios", "android"]),
  token: z.string().regex(TOKEN_RE, "invalid_token_shape"),
  deviceId: z.string().min(1).max(256),
  userId: z.string().min(1).max(256).optional(),
  appVersion: z.string().max(64).optional(),
});

export type NativePushTokenInput = z.infer<typeof nativePushTokenInputSchema>;

export type ValidationResult =
  | { ok: true; value: NativePushTokenInput }
  | { ok: false; reason: string; detail?: string };

export function validateNativePushTokenInput(raw: unknown): ValidationResult {
  const parsed = nativePushTokenInputSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      reason: "invalid_payload",
      detail: parsed.error.issues
        .slice(0, 3)
        .map((i) => `${i.path.join(".") || "<root>"}: ${i.message}`)
        .join("; "),
    };
  }
  return { ok: true, value: parsed.data };
}

/** Promotes an accepted input into the storage shape with timestamps.
 *  Pure — caller owns persistence. */
export function buildNativePushTokenRecord(args: {
  input: NativePushTokenInput;
  now?: Date;
  /** When updating an existing record, the previous record's
   *  createdAt is preserved so the audit trail stays accurate. */
  previousCreatedAt?: string;
}): NativePushToken {
  const iso = (args.now ?? new Date()).toISOString();
  return {
    platform: args.input.platform,
    token: args.input.token,
    deviceId: args.input.deviceId,
    userId: args.input.userId,
    appVersion: args.input.appVersion,
    createdAt: args.previousCreatedAt ?? iso,
    updatedAt: iso,
  };
}
