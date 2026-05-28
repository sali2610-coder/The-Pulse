// Phase 271 — ephemeral, in-memory collapse state for every
// <DashboardSection> / <SettingsAccordion> / nested folder across
// the app.
//
// Earlier revisions persisted the open/closed state per section to
// localStorage so the user's drilldowns survived reload. In practice
// that meant the app re-opened in a noisy expanded state every
// session — the opposite of the calm, scan-first surface a premium
// finance app should feel like.
//
// New rule: collapse state is held ONLY in module-scoped memory.
// Cold start = automatic clean slate (module re-evaluates). Tab
// switch / route change / app resume call `resetAllCollapseState()`
// to wipe the map. Nothing ever touches localStorage / cookies /
// IndexedDB / cloud.
//
// API is unchanged so callers don't need to be rewritten.

type CollapseMap = Map<string, boolean>;

const map: CollapseMap = new Map();
const listeners = new Set<() => void>();

/** Returns true when the section is currently collapsed. Defaults to
 *  the `defaultCollapsed` arg when the user hasn't toggled it in this
 *  session. */
export function readSectionCollapsed(
  key: string,
  defaultCollapsed: boolean,
): boolean {
  if (map.has(key)) {
    return Boolean(map.get(key));
  }
  return defaultCollapsed;
}

export function writeSectionCollapsed(key: string, collapsed: boolean): void {
  map.set(key, collapsed);
  for (const fn of listeners) fn();
}

/** Wipe every recorded collapse state. Called on tab switch, app
 *  resume, and explicitly in tests. Returns true if anything was
 *  cleared — useful for tests / instrumentation. */
export function resetAllCollapseState(): boolean {
  const had = map.size > 0;
  map.clear();
  for (const fn of listeners) fn();
  return had;
}

/** Subscribe to mutations (used by hooks that want to re-render when
 *  someone else clears the map). Returns an unsubscribe fn. */
export function subscribeCollapseState(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Test / dev helper — kept as a named export so existing tests keep
 *  importing it. Identical to `resetAllCollapseState`. */
export function _resetDashboardSectionsForTests(): void {
  resetAllCollapseState();
}
