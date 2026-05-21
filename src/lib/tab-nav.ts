// In-app tab navigation channel.
//
// Lets any component request a tab switch ("take me to settings") without
// lifting tab state through every level of the tree. AppShell subscribes
// once; callers dispatch a custom event.
//
// Stays decoupled from financial state so subscribers in lazy-loaded
// dashboard widgets never pay a render cost for nav.

export type TabId =
  | "dashboard"
  | "analytics"
  | "history"
  | "setup"
  | "settings";

const TAB_IDS: ReadonlySet<TabId> = new Set([
  "dashboard",
  "analytics",
  "history",
  "setup",
  "settings",
]);

const EVENT_NAME = "sally:nav-tab";

export function isTabId(value: string): value is TabId {
  return TAB_IDS.has(value as TabId);
}

export function navigateToTab(tab: TabId): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: tab }));
}

export function subscribeTabNav(fn: (tab: TabId) => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const handler = (event: Event) => {
    const detail = (event as CustomEvent<TabId>).detail;
    if (detail && isTabId(detail)) fn(detail);
  };
  window.addEventListener(EVENT_NAME, handler);
  return () => window.removeEventListener(EVENT_NAME, handler);
}

export function tabFromHash(hash: string): TabId | null {
  if (!hash) return null;
  const value = hash.replace(/^#/, "");
  return isTabId(value) ? value : null;
}
