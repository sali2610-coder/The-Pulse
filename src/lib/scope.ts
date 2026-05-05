// Multi-tenant scoping.
//
// Every piece of finance data lives under a "scope" — either a Clerk userId
// (multi-user mode, AUTH_ENABLED=true) or a per-device deviceId (legacy
// single-user mode). KV functions and routes accept a Scope and never see
// the raw id directly, so cross-scope leaks are impossible by construction.

export type Scope =
  | { kind: "user"; id: string }
  | { kind: "device"; id: string };

export function scopeKeyPrefix(scope: Scope): string {
  return scope.kind === "user" ? `sally:user:${scope.id}` : `sally:tx:${scope.id}`;
}

/**
 * Returns a deterministic, human-debuggable string for a scope. Used for
 * structured logging — never returned to the client.
 */
export function describeScope(scope: Scope): string {
  return `${scope.kind}:${scope.id.slice(0, 8)}…`;
}
