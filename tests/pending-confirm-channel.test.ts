import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

async function loadChannel() {
  vi.resetModules();
  return await import("@/lib/pending-confirm-channel");
}

beforeEach(() => {
  sessionStorage.clear();
});

afterEach(() => {
  sessionStorage.clear();
});

describe("pending-confirm-channel", () => {
  it("notifies subscribers of new externalIds", async () => {
    const { subscribePendingConfirmation, openPendingConfirmation } =
      await loadChannel();
    const seen: string[] = [];
    const unsub = subscribePendingConfirmation((e) => {
      seen.push(e.externalId);
    });
    openPendingConfirmation("ext-1");
    openPendingConfirmation("ext-2");
    unsub();
    expect(seen).toEqual(["ext-1", "ext-2"]);
  });

  it("replays the latest signal on subscribe (cold mount case)", async () => {
    const { subscribePendingConfirmation, openPendingConfirmation } =
      await loadChannel();
    openPendingConfirmation("replay-me");
    const seen: string[] = [];
    const unsub = subscribePendingConfirmation((e) => {
      seen.push(e.externalId);
    });
    await new Promise((r) => setTimeout(r, 0));
    expect(seen).toEqual(["replay-me"]);
    unsub();
  });

  it("persists the latest signal to sessionStorage", async () => {
    const { openPendingConfirmation } = await loadChannel();
    openPendingConfirmation("persisted");
    const raw = sessionStorage.getItem("sally.pending.confirm");
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!) as { externalId: string };
    expect(parsed.externalId).toBe("persisted");
  });

  it("replays from sessionStorage when the in-memory state is gone", async () => {
    // Simulate a fresh module load (cold tab) after a prior tab wrote
    // the marker to sessionStorage.
    sessionStorage.setItem(
      "sally.pending.confirm",
      JSON.stringify({ externalId: "from-storage", ts: Date.now() }),
    );
    const { subscribePendingConfirmation } = await loadChannel();
    const seen: string[] = [];
    const unsub = subscribePendingConfirmation((e) => {
      seen.push(e.externalId);
    });
    await new Promise((r) => setTimeout(r, 0));
    expect(seen).toEqual(["from-storage"]);
    unsub();
  });

  it("ignores stale signals older than 5 minutes", async () => {
    sessionStorage.setItem(
      "sally.pending.confirm",
      JSON.stringify({
        externalId: "stale",
        ts: Date.now() - 10 * 60 * 1000,
      }),
    );
    const { subscribePendingConfirmation } = await loadChannel();
    const seen: string[] = [];
    const unsub = subscribePendingConfirmation((e) => {
      seen.push(e.externalId);
    });
    await new Promise((r) => setTimeout(r, 0));
    expect(seen).toEqual([]);
    unsub();
  });

  it("ack clears the latest + sessionStorage so refresh doesn't re-open", async () => {
    const {
      ackPendingConfirmation,
      subscribePendingConfirmation,
      openPendingConfirmation,
    } = await loadChannel();
    openPendingConfirmation("once-only");
    ackPendingConfirmation("once-only");
    const seen: string[] = [];
    const unsub = subscribePendingConfirmation((e) => {
      seen.push(e.externalId);
    });
    await new Promise((r) => setTimeout(r, 0));
    expect(seen).toEqual([]);
    expect(sessionStorage.getItem("sally.pending.confirm")).toBeNull();
    unsub();
  });

  it("ack only clears matching externalId — newer signal is preserved", async () => {
    const {
      ackPendingConfirmation,
      subscribePendingConfirmation,
      openPendingConfirmation,
    } = await loadChannel();
    openPendingConfirmation("ext-1");
    openPendingConfirmation("ext-2");
    ackPendingConfirmation("ext-1");
    const seen: string[] = [];
    const unsub = subscribePendingConfirmation((e) => {
      seen.push(e.externalId);
    });
    await new Promise((r) => setTimeout(r, 0));
    expect(seen).toEqual(["ext-2"]);
    unsub();
  });
});
