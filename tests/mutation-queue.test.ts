import { beforeEach, describe, expect, it } from "vitest";

import {
  ackMutation,
  clearMutations,
  enqueueMutation,
  failMutation,
  listMutations,
  peekMutation,
  pendingMutationCount,
} from "@/lib/mutation-queue";

beforeEach(() => {
  clearMutations();
});

describe("mutation-queue", () => {
  it("enqueues + peeks FIFO", () => {
    enqueueMutation({ kind: "expense.add", payload: { id: "a" } });
    enqueueMutation({ kind: "expense.add", payload: { id: "b" } });
    expect(peekMutation()?.kind).toBe("expense.add");
    expect(listMutations().length).toBe(2);
  });

  it("ack removes by id", () => {
    const id = enqueueMutation({ kind: "test", payload: {} });
    enqueueMutation({ kind: "test", payload: {} });
    ackMutation(id);
    expect(listMutations().length).toBe(1);
  });

  it("fail bumps attempts and schedules backoff", () => {
    const id = enqueueMutation({ kind: "test", payload: {} });
    failMutation(id, "network");
    const m = listMutations().find((x) => x.id === id)!;
    expect(m.attempts).toBe(1);
    expect(m.lastError).toBe("network");
    expect(m.nextAttemptAt).toBeDefined();
  });

  it("backoff caps at 8 attempts", () => {
    const id = enqueueMutation({ kind: "test", payload: {} });
    for (let i = 0; i < 12; i++) failMutation(id, "boom");
    const m = listMutations().find((x) => x.id === id)!;
    expect(m.attempts).toBeLessThanOrEqual(8);
  });

  it("pendingMutationCount only counts entries past their backoff window", () => {
    const id = enqueueMutation({ kind: "test", payload: {} });
    expect(pendingMutationCount()).toBe(1);
    failMutation(id, "x");
    // nextAttemptAt is in the future → not pending right now.
    expect(pendingMutationCount(Date.now())).toBe(0);
    expect(pendingMutationCount(Date.now() + 24 * 60 * 60 * 1000)).toBe(1);
  });

  it("clear wipes everything", () => {
    enqueueMutation({ kind: "test", payload: {} });
    enqueueMutation({ kind: "test", payload: {} });
    clearMutations();
    expect(listMutations().length).toBe(0);
  });
});
