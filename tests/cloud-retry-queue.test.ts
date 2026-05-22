// Pure-logic tests for the failed-write retry queue policy.
// Mirrors enqueueRetry + drainRetryQueue from use-cloud-sync.ts so the
// rule can be locked in without React or a Supabase round-trip.

import { describe, expect, it, beforeEach } from "vitest";

const RETRY_MAX = 200;

type Item = { id: string };

function makeQueue() {
  const q: Item[] = [];
  return {
    push(item: Item) {
      q.push(item);
      if (q.length > RETRY_MAX) q.splice(0, q.length - RETRY_MAX);
    },
    drain(handler: (item: Item) => boolean) {
      // Stops on first failure so a still-down backend doesn't burn
      // the whole queue on the same error.
      while (q.length > 0) {
        const ok = handler(q[0]);
        if (!ok) return;
        q.shift();
      }
    },
    snapshot() {
      return [...q];
    },
    size() {
      return q.length;
    },
  };
}

describe("retry-queue enqueue", () => {
  it("appends FIFO", () => {
    const q = makeQueue();
    q.push({ id: "a" });
    q.push({ id: "b" });
    expect(q.snapshot().map((x) => x.id)).toEqual(["a", "b"]);
  });

  it("bounds at RETRY_MAX, evicting OLDEST", () => {
    const q = makeQueue();
    for (let i = 0; i < RETRY_MAX + 5; i++) q.push({ id: `i${i}` });
    expect(q.size()).toBe(RETRY_MAX);
    // First 5 should have been dropped.
    expect(q.snapshot()[0].id).toBe("i5");
    expect(q.snapshot()[RETRY_MAX - 1].id).toBe(`i${RETRY_MAX + 4}`);
  });
});

describe("retry-queue drain", () => {
  it("drains all when handler succeeds", () => {
    const q = makeQueue();
    q.push({ id: "a" });
    q.push({ id: "b" });
    q.drain(() => true);
    expect(q.size()).toBe(0);
  });

  it("stops on first failure, preserves remaining order", () => {
    const q = makeQueue();
    q.push({ id: "a" });
    q.push({ id: "b" });
    q.push({ id: "c" });
    let n = 0;
    q.drain(() => {
      n++;
      return n < 2; // 1st succeeds, 2nd fails
    });
    expect(q.snapshot().map((x) => x.id)).toEqual(["b", "c"]);
  });

  it("noop on empty queue", () => {
    const q = makeQueue();
    let called = false;
    q.drain(() => {
      called = true;
      return true;
    });
    expect(called).toBe(false);
  });
});

describe("status-tone policy", () => {
  // Pure mirror of the CloudSyncCard tone selector.
  function tone(s: {
    online: boolean;
    hydrating: boolean;
    lastError: string | null;
    pendingRetries: number;
    inSync: boolean;
    hydrated: boolean;
  }): "offline" | "syncing" | "error" | "ok" | "waiting" {
    if (!s.online) return "offline";
    if (s.hydrating) return "syncing";
    if (s.lastError || s.pendingRetries > 0) return "error";
    if (s.inSync && s.hydrated) return "ok";
    return "waiting";
  }

  const BASE = {
    online: true,
    hydrating: false,
    lastError: null as string | null,
    pendingRetries: 0,
    inSync: true,
    hydrated: true,
  };

  it("offline beats everything else", () => {
    expect(tone({ ...BASE, online: false })).toBe("offline");
  });

  it("hydrating beats error", () => {
    expect(tone({ ...BASE, hydrating: true, lastError: "x" })).toBe("syncing");
  });

  it("pendingRetries surfaces error tone", () => {
    expect(tone({ ...BASE, pendingRetries: 3 })).toBe("error");
  });

  it("clean online + hydrated + in-sync → ok", () => {
    expect(tone(BASE)).toBe("ok");
  });

  it("hydrated but not in sync → waiting", () => {
    expect(tone({ ...BASE, inSync: false })).toBe("waiting");
  });
});

beforeEach(() => {
  /* nothing to reset — makeQueue is local per test */
});
