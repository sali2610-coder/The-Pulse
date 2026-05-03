const STORAGE_KEY = "sally.deviceId";
const CREATED_AT_KEY = "sally.deviceId.createdAt";
export const DEVICE_ID_ROTATION_DAYS = 90;

function generateId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `dev-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function getOrCreateDeviceId(): string {
  if (typeof window === "undefined") return "ssr";
  const existing = window.localStorage.getItem(STORAGE_KEY);
  if (existing) {
    if (!window.localStorage.getItem(CREATED_AT_KEY)) {
      // Backfill timestamp for ids created before rotation tracking landed.
      window.localStorage.setItem(CREATED_AT_KEY, String(Date.now()));
    }
    return existing;
  }
  const fresh = generateId();
  window.localStorage.setItem(STORAGE_KEY, fresh);
  window.localStorage.setItem(CREATED_AT_KEY, String(Date.now()));
  return fresh;
}

export function getDeviceIdCreatedAt(): number {
  if (typeof window === "undefined") return 0;
  const raw = window.localStorage.getItem(CREATED_AT_KEY);
  return raw ? Number(raw) : 0;
}

export function deviceIdAgeDays(now: number = Date.now()): number {
  const created = getDeviceIdCreatedAt();
  if (!created) return 0;
  return Math.floor((now - created) / (1000 * 60 * 60 * 24));
}

export function rotateDeviceId(): string {
  if (typeof window === "undefined") return "ssr";
  const fresh = generateId();
  window.localStorage.setItem(STORAGE_KEY, fresh);
  window.localStorage.setItem(CREATED_AT_KEY, String(Date.now()));
  return fresh;
}
