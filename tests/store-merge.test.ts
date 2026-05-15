import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The store imports Zustand `persist` which references localStorage at module
// load. We import it inside each test after resetting localStorage so the
// fresh hydration path runs.
async function loadStore() {
  vi.resetModules();
  const mod = await import("@/lib/store");
  return mod;
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
});

describe("store.addExpense — merge on enrichment", () => {
  it("enriches a wallet-pending entry when SMS arrives with full data", async () => {
    const { useFinanceStore } = await loadStore();
    const store = useFinanceStore.getState();

    // 1. Wallet partial lands first.
    const walletRes = store.addExpense({
      amount: 42.9,
      category: "food",
      installments: 1,
      paymentMethod: "credit",
      source: "wallet",
      externalId: "wallet|abc",
      chargeDate: new Date(2026, 4, 3, 14, 0, 0).toISOString(),
      needsConfirmation: true,
    });
    expect(walletRes.duplicate).toBe(false);
    expect(walletRes.merged).toBeFalsy();
    expect(walletRes.entry.needsConfirmation).toBe(true);
    expect(walletRes.entry.merchant).toBeUndefined();

    // 2. SMS with the same charge arrives later with full data.
    const smsRes = useFinanceStore.getState().addExpense({
      amount: 42.9,
      category: "food",
      installments: 1,
      paymentMethod: "credit",
      source: "sms",
      externalId: "sms|xyz",
      issuer: "cal",
      cardLast4: "1234",
      merchant: "Shufersal",
      chargeDate: new Date(2026, 4, 3, 15, 0, 0).toISOString(),
    });
    expect(smsRes.merged).toBe(true);
    expect(smsRes.duplicate).toBe(false);
    expect(smsRes.entry.id).toBe(walletRes.entry.id);
    expect(smsRes.entry.merchant).toBe("Shufersal");
    expect(smsRes.entry.cardLast4).toBe("1234");
    expect(smsRes.entry.needsConfirmation).toBeUndefined();

    // 3. Store has exactly one entry, the enriched one.
    const entries = useFinanceStore.getState().entries;
    expect(entries.length).toBe(1);
    expect(entries[0].id).toBe(walletRes.entry.id);
    expect(entries[0].merchant).toBe("Shufersal");
  });

  it("blocks an SMS re-import as duplicate (no merge target)", async () => {
    const { useFinanceStore } = await loadStore();
    const store = useFinanceStore.getState();

    const first = store.addExpense({
      amount: 42.9,
      category: "food",
      installments: 1,
      paymentMethod: "credit",
      source: "sms",
      externalId: "sms|first",
      issuer: "cal",
      cardLast4: "1234",
      merchant: "Shufersal",
      chargeDate: new Date(2026, 4, 3, 12, 0, 0).toISOString(),
    });
    expect(first.duplicate).toBe(false);

    const replay = useFinanceStore.getState().addExpense({
      amount: 42.9,
      category: "food",
      installments: 1,
      paymentMethod: "credit",
      source: "sms",
      externalId: "sms|second",
      issuer: "cal",
      cardLast4: "1234",
      merchant: "Shufersal",
      chargeDate: new Date(2026, 4, 3, 13, 0, 0).toISOString(),
    });
    expect(replay.duplicate).toBe(true);
    expect(replay.merged).toBeFalsy();
    expect(useFinanceStore.getState().entries.length).toBe(1);
  });

  it("fills missing cardLast4 on a pending wallet entry that already has a merchant", async () => {
    const { useFinanceStore } = await loadStore();

    // Wallet partial — already knows merchant but not the card.
    const w = useFinanceStore.getState().addExpense({
      amount: 42.9,
      category: "food",
      installments: 1,
      paymentMethod: "credit",
      source: "wallet",
      externalId: "wallet|abc",
      merchant: "Shufersal",
      chargeDate: new Date(2026, 4, 3, 14, 0, 0).toISOString(),
      needsConfirmation: true,
    });
    expect(w.entry.merchant).toBe("Shufersal");
    expect(w.entry.cardLast4).toBeUndefined();

    const sms = useFinanceStore.getState().addExpense({
      amount: 42.9,
      category: "food",
      installments: 1,
      paymentMethod: "credit",
      source: "sms",
      externalId: "sms|xyz",
      issuer: "cal",
      cardLast4: "1234",
      merchant: "Shufersal",
      chargeDate: new Date(2026, 4, 3, 15, 0, 0).toISOString(),
    });
    expect(sms.merged).toBe(true);
    // Existing merchant retained, card filled in, confirmation gate cleared.
    expect(sms.entry.merchant).toBe("Shufersal");
    expect(sms.entry.cardLast4).toBe("1234");
    expect(sms.entry.needsConfirmation).toBeUndefined();
  });
});

describe("store migrate v5 → v6", () => {
  it("renames legacy ExpenseEntry.pending → bankPending on hydration", async () => {
    // Seed localStorage with a v5 dump containing the legacy `pending` field.
    const v5Dump = {
      state: {
        entries: [
          {
            id: "legacy-1",
            amount: 100,
            category: "food",
            source: "auto",
            paymentMethod: "credit",
            installments: 1,
            chargeDate: new Date(2026, 4, 3).toISOString(),
            createdAt: new Date(2026, 4, 3).toISOString(),
            pending: true,
          },
        ],
        rules: [],
        statuses: [],
        monthlyBudget: 0,
        lastSyncedAt: 0,
        accounts: [],
        loans: [],
        incomes: [],
        audioEnabled: true,
      },
      version: 5,
    };
    localStorage.setItem("sally.finance", JSON.stringify(v5Dump));

    const { useFinanceStore } = await loadStore();
    // Force rehydration with the seeded data.
    await useFinanceStore.persist.rehydrate();

    const entries = useFinanceStore.getState().entries;
    expect(entries.length).toBe(1);
    expect(entries[0].id).toBe("legacy-1");
    // @ts-expect-error legacy field should not be present
    expect(entries[0].pending).toBeUndefined();
    expect(entries[0].bankPending).toBe(true);
  });

  it("leaves entries without legacy pending field untouched", async () => {
    const v5Dump = {
      state: {
        entries: [
          {
            id: "clean-1",
            amount: 50,
            category: "transport",
            source: "manual",
            paymentMethod: "cash",
            installments: 1,
            chargeDate: new Date(2026, 4, 3).toISOString(),
            createdAt: new Date(2026, 4, 3).toISOString(),
          },
        ],
        rules: [],
        statuses: [],
        monthlyBudget: 0,
        lastSyncedAt: 0,
        accounts: [],
        loans: [],
        incomes: [],
        audioEnabled: true,
      },
      version: 5,
    };
    localStorage.setItem("sally.finance", JSON.stringify(v5Dump));

    const { useFinanceStore } = await loadStore();
    await useFinanceStore.persist.rehydrate();

    const entries = useFinanceStore.getState().entries;
    expect(entries.length).toBe(1);
    expect(entries[0].bankPending).toBeUndefined();
  });
});
