// localStorage-backed collapse state for <DashboardSection>.
//
// Each section identifies itself with a stable string key (chosen by
// the caller, not the visible label so renames stay backwards-
// compatible). State is kept in a single JSON map under one key so
// we never compete with another module's keys.
//
// Pure module — safe to import from server contexts; SSR-side calls
// return defaults without touching window.

const STORAGE_KEY = "sally.dashboard.sections.v1";

type CollapseMap = Record<string, boolean>;

function readMap(): CollapseMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as CollapseMap;
  } catch {
    return {};
  }
}

function writeMap(map: CollapseMap): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* quota / disabled — degrade silently */
  }
}

/** Returns true when the section is currently collapsed. Defaults to
 *  the `defaultCollapsed` arg when the user hasn't toggled it yet. */
export function readSectionCollapsed(
  key: string,
  defaultCollapsed: boolean,
): boolean {
  const map = readMap();
  if (Object.prototype.hasOwnProperty.call(map, key)) {
    return Boolean(map[key]);
  }
  return defaultCollapsed;
}

export function writeSectionCollapsed(key: string, collapsed: boolean): void {
  const map = readMap();
  map[key] = collapsed;
  writeMap(map);
}

/** Test/dev helper — clears every recorded collapse state. */
export function _resetDashboardSectionsForTests(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
