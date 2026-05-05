// Personal API Tokens.
//
// Each Clerk user owns one personal token. The iOS Shortcut sends it as a
// Bearer header on the webhook; the server resolves the token to the user's
// Clerk userId and writes the resulting transaction into a user-scoped KV
// namespace.
//
// Storage shape (Upstash):
//   sally:apitoken:<token>           → userId          (reverse index)
//   sally:user:<userId>:apitoken     → token           (forward, for display)
//
// Rotating a token deletes the old reverse-index entry so any leaked copy
// instantly stops working.

import { kv, isKvConfigured } from "@/lib/kv";

const TOKEN_BYTES = 32; // 256-bit
const TOKEN_PREFIX = "stk_";

const reverseKey = (token: string) => `sally:apitoken:${token}`;
const forwardKey = (userId: string) => `sally:user:${userId}:apitoken`;

function bytesToHex(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += bytes[i].toString(16).padStart(2, "0");
  return s;
}

export function generateToken(): string {
  const bytes = new Uint8Array(TOKEN_BYTES);
  crypto.getRandomValues(bytes);
  return TOKEN_PREFIX + bytesToHex(bytes);
}

/**
 * Look up the userId associated with a token. Returns null when the token
 * doesn't exist or has been rotated/revoked.
 */
export async function resolveTokenToUserId(
  token: string,
): Promise<string | null> {
  if (!isKvConfigured()) return null;
  if (!token || !token.startsWith(TOKEN_PREFIX)) return null;
  const v = await kv().get(reverseKey(token));
  return typeof v === "string" ? v : null;
}

/**
 * Returns the user's existing token, or null if they've never generated one.
 */
export async function getUserToken(userId: string): Promise<string | null> {
  if (!isKvConfigured()) return null;
  const v = await kv().get(forwardKey(userId));
  return typeof v === "string" ? v : null;
}

/**
 * Generates a fresh token for the user, atomically replacing any prior one.
 * Old token is invalidated so leaked copies stop working immediately.
 */
export async function rotateUserToken(userId: string): Promise<string> {
  if (!isKvConfigured()) {
    throw new Error("KV is not configured");
  }
  const existing = await getUserToken(userId);
  const fresh = generateToken();
  // Set forward + reverse first so the new token is live before we revoke
  // the old one. Order matters: a brief window where both work is safer than
  // a brief window where neither works.
  await kv().set(forwardKey(userId), fresh);
  await kv().set(reverseKey(fresh), userId);
  if (existing && existing !== fresh) {
    await kv().del(reverseKey(existing));
  }
  return fresh;
}

/**
 * Revoke the user's token entirely (no replacement). The Shortcut will start
 * receiving 401s until the user generates a new one.
 */
export async function revokeUserToken(userId: string): Promise<void> {
  if (!isKvConfigured()) return;
  const existing = await getUserToken(userId);
  if (existing) await kv().del(reverseKey(existing));
  await kv().del(forwardKey(userId));
}
