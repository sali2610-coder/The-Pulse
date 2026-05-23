// Reminder module facade.
//
// Re-exports the public surface so consumers import from a single path
// and the internal file layout can evolve without breaking call sites.
//
// SHIPPED TODAY:
//   * Type contracts (`Reminder`, `ReminderKind`, …)
//   * Pure evaluator (`evaluateReminders`) over a store snapshot
//   * Thresholds (with tunable knobs)
//
// NOT WIRED YET:
//   * Dispatcher (cron / server action / client tick)
//   * Idempotency store (KV key per `reminderKey` per month)
//   * Push fan-out — see [src/lib/push-server.ts](../push-server.ts).
//     The existing categorize-prompt flow stays untouched.

export { evaluateReminders } from "./evaluators";
export {
  DEFAULT_THRESHOLDS,
  type Reminder,
  type ReminderEvaluatorInput,
  type ReminderKind,
  type ReminderSeverity,
  type ReminderThresholds,
} from "./types";
