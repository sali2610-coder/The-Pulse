import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock the KV layer so the route handler can be tested without a real
// Upstash connection.
const store = new Map<string, unknown>();
let kvConfigured = true;

vi.mock("@/lib/kv", async () => {
  const actual = await vi.importActual<typeof import("@/lib/kv")>("@/lib/kv");
  return {
    ...actual,
    isKvConfigured: () => kvConfigured,
    getUserState: vi.fn(async (scope: { kind: string; id: string }) => {
      return (store.get(`${scope.kind}:${scope.id}`) ?? null) as unknown;
    }),
    saveUserState: vi.fn(
      async (
        scope: { kind: string; id: string },
        blob: { version: number; updatedAt: number; state: unknown },
      ) => {
        store.set(`${scope.kind}:${scope.id}`, blob);
      },
    ),
  };
});

// Auth resolver — always succeeds with the device id from the header.
vi.mock("@/lib/scope-resolver", () => ({
  async resolveRequestScope(req: Request) {
    const id = req.headers.get("x-sally-device") ?? "";
    if (!id) return { ok: false, status: 400, code: "invalid_device" };
    return { ok: true, scope: { kind: "device" as const, id } };
  },
}));

import { GET, PUT } from "@/app/api/state/route";

beforeEach(() => {
  store.clear();
  kvConfigured = true;
});

describe("/api/state route", () => {
  it("GET returns null blob when nothing saved yet", async () => {
    const req = new Request("https://t/api/state", {
      headers: { "x-sally-device": "dev-a" },
    });
    const res = await GET(req);
    const body = (await res.json()) as {
      ok: boolean;
      configured: boolean;
      blob: unknown;
    };
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.blob).toBeNull();
  });

  it("PUT persists the blob and GET returns it", async () => {
    const payload = {
      version: 1,
      state: { entries: [{ id: "e1" }], monthlyBudget: 5000 },
    };
    const putReq = new Request("https://t/api/state", {
      method: "PUT",
      headers: {
        "x-sally-device": "dev-b",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const putRes = await PUT(putReq);
    expect(putRes.status).toBe(200);
    const putBody = (await putRes.json()) as {
      ok: boolean;
      updatedAt: number;
    };
    expect(putBody.ok).toBe(true);
    expect(putBody.updatedAt).toBeGreaterThan(0);

    const getReq = new Request("https://t/api/state", {
      headers: { "x-sally-device": "dev-b" },
    });
    const getRes = await GET(getReq);
    const getBody = (await getRes.json()) as {
      ok: boolean;
      blob: { state: { monthlyBudget: number; entries: { id: string }[] } };
    };
    expect(getBody.blob.state.monthlyBudget).toBe(5000);
    expect(getBody.blob.state.entries).toEqual([{ id: "e1" }]);
  });

  it("isolates blobs per device id", async () => {
    const writeDev = async (id: string, budget: number) => {
      const req = new Request("https://t/api/state", {
        method: "PUT",
        headers: { "x-sally-device": id, "Content-Type": "application/json" },
        body: JSON.stringify({ version: 1, state: { monthlyBudget: budget } }),
      });
      return PUT(req);
    };
    await writeDev("dev-c", 1000);
    await writeDev("dev-d", 9999);

    const readDev = async (id: string) => {
      const req = new Request("https://t/api/state", {
        headers: { "x-sally-device": id },
      });
      const r = await GET(req);
      return (await r.json()) as {
        blob: { state: { monthlyBudget: number } } | null;
      };
    };
    const c = await readDev("dev-c");
    const d = await readDev("dev-d");
    expect(c.blob?.state.monthlyBudget).toBe(1000);
    expect(d.blob?.state.monthlyBudget).toBe(9999);
  });

  it("rejects PUT when KV is not configured", async () => {
    kvConfigured = false;
    const req = new Request("https://t/api/state", {
      method: "PUT",
      headers: { "x-sally-device": "dev-e", "Content-Type": "application/json" },
      body: JSON.stringify({ version: 1, state: {} }),
    });
    const res = await PUT(req);
    expect(res.status).toBe(503);
  });

  it("returns 400 for malformed body", async () => {
    const req = new Request("https://t/api/state", {
      method: "PUT",
      headers: { "x-sally-device": "dev-f", "Content-Type": "application/json" },
      body: "not-json",
    });
    const res = await PUT(req);
    expect(res.status).toBe(400);
  });

  it("requires a valid device id", async () => {
    const req = new Request("https://t/api/state", { method: "GET" });
    const res = await GET(req);
    expect(res.status).toBe(400);
  });
});
