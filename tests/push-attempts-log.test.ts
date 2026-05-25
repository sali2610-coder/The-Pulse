import { beforeEach, describe, expect, it, vi } from "vitest";

// Phase 222 — exercise the rolling push-attempt log via an in-memory
// fake Upstash client. Verifies recordPushAttempt appends + trims,
// and listPushAttempts returns the right window in newest-first order.

const lists = new Map<string, string[]>();
const strings = new Map<string, string>();
const ttls = new Map<string, number>();

vi.mock("@upstash/redis", () => {
  class Redis {
    async set(key: string, value: string): Promise<"OK"> {
      strings.set(key, value);
      return "OK";
    }
    async get(key: string): Promise<string | null> {
      return strings.get(key) ?? null;
    }
    async expire(key: string, seconds: number): Promise<number> {
      ttls.set(key, seconds);
      return 1;
    }
    async lpush(key: string, ...values: string[]): Promise<number> {
      const arr = lists.get(key) ?? [];
      arr.unshift(...values);
      lists.set(key, arr);
      return arr.length;
    }
    async ltrim(key: string, start: number, stop: number): Promise<"OK"> {
      const arr = lists.get(key) ?? [];
      // Upstash ltrim semantics: keep arr[start..stop] inclusive.
      lists.set(key, arr.slice(start, stop + 1));
      return "OK";
    }
    async lrange(
      key: string,
      start: number,
      stop: number,
    ): Promise<string[]> {
      const arr = lists.get(key) ?? [];
      return arr.slice(start, stop + 1);
    }
  }
  return { Redis };
});

beforeEach(() => {
  lists.clear();
  strings.clear();
  ttls.clear();
  process.env.KV_REST_API_URL = "https://t.test";
  process.env.KV_REST_API_TOKEN = "tok";
});

const SCOPE = { kind: "user" as const, id: "u1" };

describe("recordPushAttempt + listPushAttempts", () => {
  it("appends in newest-first order via LPUSH", async () => {
    const { recordPushAttempt, listPushAttempts } = await import("@/lib/kv");
    await recordPushAttempt(SCOPE, {
      ts: 1,
      ok: true,
      gone: false,
      externalId: "first",
    });
    await recordPushAttempt(SCOPE, {
      ts: 2,
      ok: true,
      gone: false,
      externalId: "second",
    });
    await recordPushAttempt(SCOPE, {
      ts: 3,
      ok: false,
      gone: true,
      status: 410,
      reason: "GONE",
      externalId: "third",
    });

    const out = await listPushAttempts(SCOPE);
    expect(out.map((a) => a.externalId)).toEqual(["third", "second", "first"]);
    expect(out[0].gone).toBe(true);
    expect(out[0].status).toBe(410);
  });

  it("trims the log to PUSH_LOG_MAX (50) entries", async () => {
    const { recordPushAttempt, listPushAttempts } = await import("@/lib/kv");
    for (let i = 0; i < 60; i++) {
      await recordPushAttempt(SCOPE, {
        ts: i,
        ok: true,
        gone: false,
        externalId: `e${i}`,
      });
    }
    const out = await listPushAttempts(SCOPE);
    expect(out).toHaveLength(50);
    // Newest first → last write is at index 0.
    expect(out[0].externalId).toBe("e59");
    expect(out[49].externalId).toBe("e10");
  });

  it("listPushAttempts honors a smaller explicit limit", async () => {
    const { recordPushAttempt, listPushAttempts } = await import("@/lib/kv");
    for (let i = 0; i < 5; i++) {
      await recordPushAttempt(SCOPE, {
        ts: i,
        ok: true,
        gone: false,
        externalId: `e${i}`,
      });
    }
    const out = await listPushAttempts(SCOPE, 2);
    expect(out.map((a) => a.externalId)).toEqual(["e4", "e3"]);
  });

  it("isolates scopes — user vs device do not share the log", async () => {
    const { recordPushAttempt, listPushAttempts } = await import("@/lib/kv");
    await recordPushAttempt(SCOPE, {
      ts: 1,
      ok: true,
      gone: false,
      externalId: "user-only",
    });
    await recordPushAttempt(
      { kind: "device", id: "u1" },
      { ts: 1, ok: true, gone: false, externalId: "device-only" },
    );

    const userLog = await listPushAttempts(SCOPE);
    const deviceLog = await listPushAttempts({ kind: "device", id: "u1" });
    expect(userLog.map((a) => a.externalId)).toEqual(["user-only"]);
    expect(deviceLog.map((a) => a.externalId)).toEqual(["device-only"]);
  });
});
