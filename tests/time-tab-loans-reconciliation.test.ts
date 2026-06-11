// Phase 423 — Time tab loans reconciliation.
//
// User reported all five Time chips ignored active loans:
//   Car loan      = 870 ILS
//   Studies loan  = 2,700 ILS
//   Σ active loan payments = 3,570 ILS / month
//
// Root cause: cash-flow-bucket skips loan installments whose date
// is <= now (past-month dates), and effectiveCashImpactStream only
// scans entries + rules — loans were never folded into past-bank
// debits. So a loan that fired on the 5th of THIS month never
// showed up in LIVE balance or any future chip's cumulative
// breakdown; only future months' installments surfaced.
//
// Fix: liquidity-curve now scans active loans for the current
// month, folds past installments into pastBankDebits (so LIVE
// reflects them) and surfaces them as day-0 events for
// traceability. Future installments stay in the main events stream.
//
// This test reproduces the user's exact scenario and pins:
//   1. activeLoans roster.
//   2. Reconciliation table for LIVE / 10 / EOM / 2 next / 10 next.
//   3. Σ loan impact across the window === 3,570 ILS / month
//      (or 7,140 when the window straddles two installment cycles).

import { describe, expect, it } from "vitest";

import { buildEngineCtx, getLiquidityCurve } from "@/lib/financial-engine";
import type { Account, Loan } from "@/types/finance";

const TODAY = new Date(2026, 5, 11, 14, 0, 0); // 2026-06-11 14:00 local

const CAR_LOAN: Loan = {
  id: "l-car",
  label: "הלוואת רכב",
  monthlyInstallment: 870,
  dayOfMonth: 5, // already fired this month (June 5)
  active: true,
  createdAt: "2024-01-01T00:00:00.000Z",
};

const STUDIES_LOAN: Loan = {
  id: "l-studies",
  label: "הלוואת לימודים",
  monthlyInstallment: 2_700,
  dayOfMonth: 20, // fires later this month (June 20)
  active: true,
  createdAt: "2024-01-01T00:00:00.000Z",
};

function bank(o: Partial<Account> = {}): Account {
  return {
    id: o.id ?? "bank-1",
    kind: "bank",
    label: "Bank",
    active: true,
    createdAt: "2025-01-01T00:00:00.000Z",
    anchorBalance: o.anchorBalance ?? 20_000,
    // Anchor predates June 5 so the past-loan debit applies.
    anchorUpdatedAt:
      o.anchorUpdatedAt ?? new Date(2026, 5, 1, 0, 0, 0).toISOString(),
    ...o,
  };
}

function buildCtx() {
  return buildEngineCtx({
    accounts: [bank()],
    loans: [CAR_LOAN, STUDIES_LOAN],
    incomes: [],
    rules: [],
    statuses: [],
    entries: [],
    monthlyBudget: 0,
    monthKey: "2026-06",
    now: TODAY,
  });
}

describe("Phase 423 — activeLoans roster", () => {
  it("prints activeLoans and verifies sum === 3,570 ILS / month", () => {
    const ctx = buildCtx();
    const activeLoans = ctx.loans
      .filter((l) => l.active)
      .map((l) => ({
        id: l.id,
        name: l.label,
        monthlyPayment: l.monthlyInstallment,
        nextDueDate: `2026-06-${String(l.dayOfMonth).padStart(2, "0")}`,
        enabled: l.active,
        includedInProjection: true,
      }));
    // eslint-disable-next-line no-console
    console.table(activeLoans);
    expect(activeLoans).toHaveLength(2);
    const total = activeLoans.reduce((s, l) => s + l.monthlyPayment, 0);
    expect(total).toBe(3_570);
  });
});

describe("Phase 426 — user's exact LIVE complaint: 3 loans, today after car+studies but before mortgage", () => {
  const CAR: Loan = {
    id: "l-car",
    label: "הלוואת רכב",
    monthlyInstallment: 870,
    dayOfMonth: 2,
    active: true,
    createdAt: "2024-01-01T00:00:00.000Z",
  };
  const STUDIES: Loan = {
    id: "l-studies",
    label: "הלוואת לימודים",
    monthlyInstallment: 2_700,
    dayOfMonth: 20,
    active: true,
    createdAt: "2024-01-01T00:00:00.000Z",
  };
  const MORTGAGE: Loan = {
    id: "l-mort",
    label: "משכנתא",
    monthlyInstallment: 1_400,
    dayOfMonth: 25,
    active: true,
    createdAt: "2024-01-01T00:00:00.000Z",
  };
  // 22 June 2026 — Car (day 2) + Studies (day 20) already fired,
  // Mortgage (day 25) still upcoming.
  const NOW = new Date(2026, 5, 22, 9, 0, 0);

  it("LIVE day-0 events list BOTH Car (-870) and Studies (-2,700) as past", () => {
    const ctx = buildEngineCtx({
      accounts: [
        bank({
          anchorBalance: 22_000,
          anchorUpdatedAt: new Date(2026, 5, 1, 0, 0, 0).toISOString(),
        }),
      ],
      loans: [CAR, STUDIES, MORTGAGE],
      incomes: [],
      rules: [],
      statuses: [],
      entries: [],
      monthlyBudget: 0,
      monthKey: "2026-06",
      now: NOW,
    });
    const curve = getLiquidityCurve(ctx, 60);
    const day0 = curve.points[0];
    const carEv = day0.events.find(
      (e) => e.kind === "loan" && Math.abs(e.amount) === 870,
    );
    const studiesEv = day0.events.find(
      (e) => e.kind === "loan" && Math.abs(e.amount) === 2_700,
    );
    expect(carEv, "Car loan past installment must be on day 0").toBeDefined();
    expect(
      studiesEv,
      "Studies loan past installment must be on day 0",
    ).toBeDefined();
    // Mortgage hasn't fired yet — should be in a future point.
    const mortgageFuture = curve.points
      .flatMap((p) => p.events)
      .find(
        (e) => e.kind === "loan" && Math.abs(e.amount) === 1_400,
      );
    expect(mortgageFuture, "Mortgage must surface as future event").toBeDefined();
    expect(mortgageFuture!.whenISO.startsWith("2026-06-25")).toBe(true);
  });

  it("LIVE balance = anchor − (Car + Studies); Mortgage NOT yet deducted", () => {
    const ctx = buildEngineCtx({
      accounts: [
        bank({
          anchorBalance: 22_000,
          anchorUpdatedAt: new Date(2026, 5, 1, 0, 0, 0).toISOString(),
        }),
      ],
      loans: [CAR, STUDIES, MORTGAGE],
      incomes: [],
      rules: [],
      statuses: [],
      entries: [],
      monthlyBudget: 0,
      monthKey: "2026-06",
      now: NOW,
    });
    const curve = getLiquidityCurve(ctx, 60);
    // LIVE = startingBalance − Car − Studies (anchor predates both).
    expect(curve.points[0].balance).toBe(22_000 - 870 - 2_700);
  });

  it("EOM continues past LIVE — Mortgage 25th + next-month installments propagate", () => {
    const ctx = buildEngineCtx({
      accounts: [
        bank({
          anchorBalance: 22_000,
          anchorUpdatedAt: new Date(2026, 5, 1, 0, 0, 0).toISOString(),
        }),
      ],
      loans: [CAR, STUDIES, MORTGAGE],
      incomes: [],
      rules: [],
      statuses: [],
      entries: [],
      monthlyBudget: 0,
      monthKey: "2026-06",
      now: NOW,
    });
    const curve = getLiquidityCurve(ctx, 60);
    // Day index from June 22 to June 30 = 8.
    const eomBal = curve.points[8].balance;
    // Mortgage June 25 must have fired by EOM.
    expect(eomBal).toBe(22_000 - 870 - 2_700 - 1_400);
  });
});

describe("Phase 424 — past loan installment surfaces even when anchor was refreshed after the debit", () => {
  it("anchorUpdatedAt AFTER studies debit still shows the event (no balance double-deduction)", () => {
    // User refreshed the anchor on the 21st AFTER the studies loan
    // fired on the 20th. Their typed balance already reflects the
    // debit — we must NOT subtract again, but the event MUST still
    // appear in the day-0 trail so the user sees "Studies -2,700
    // ירד אתמול" on LIVE.
    const anchorAfterDebit = new Date(2026, 5, 21, 8, 0, 0);
    const TODAY_LATE = new Date(2026, 5, 21, 18, 0, 0);
    const ctx = buildEngineCtx({
      accounts: [bank({ anchorBalance: 17_300, anchorUpdatedAt: anchorAfterDebit.toISOString() })],
      loans: [STUDIES_LOAN], // dayOfMonth=20
      incomes: [],
      rules: [],
      statuses: [],
      entries: [],
      monthlyBudget: 0,
      monthKey: "2026-06",
      now: TODAY_LATE,
    });
    const curve = getLiquidityCurve(ctx, 60);

    // Balance stays at the typed anchor — no double-deduction.
    expect(curve.startingBalance).toBe(17_300);
    expect(curve.points[0].balance).toBe(17_300);
    // Event still surfaces on day 0 so the user reads "Studies fired",
    // marked informational so the balance walk skips it.
    const studiesDay0 = curve.points[0].events.find(
      (e) => e.kind === "loan" && Math.abs(e.amount) === 2_700,
    );
    expect(studiesDay0).toBeDefined();
    expect(studiesDay0!.informational).toBe(true);
  });

  it("anchorUpdatedAt BEFORE studies debit subtracts AND shows", () => {
    const anchorBeforeDebit = new Date(2026, 5, 1, 8, 0, 0);
    const TODAY_AFTER = new Date(2026, 5, 21, 18, 0, 0);
    const ctx = buildEngineCtx({
      accounts: [bank({ anchorBalance: 20_000, anchorUpdatedAt: anchorBeforeDebit.toISOString() })],
      loans: [STUDIES_LOAN],
      incomes: [],
      rules: [],
      statuses: [],
      entries: [],
      monthlyBudget: 0,
      monthKey: "2026-06",
      now: TODAY_AFTER,
    });
    const curve = getLiquidityCurve(ctx, 60);
    expect(curve.startingBalance).toBe(20_000);
    expect(curve.points[0].balance).toBe(20_000 - 2_700);
    const studiesDay0 = curve.points[0].events.find(
      (e) =>
        e.kind === "loan" &&
        Math.abs(e.amount) === 2_700 &&
        e.informational !== true,
    );
    expect(studiesDay0).toBeDefined();
  });
});

describe("Phase 423 — loan impact in every Time chip projection", () => {
  it("LIVE deducts past-month installment (Car) + lists it as day-0 event", () => {
    const ctx = buildCtx();
    const curve = getLiquidityCurve(ctx, 60);
    // Phase 425 — startingBalance is the raw typed anchor. The
    // past-Car installment is folded into the day-0 walk, so
    // curve.points[0].balance reflects the post-deduction LIVE total.
    expect(curve.startingBalance).toBe(20_000);
    expect(curve.points[0].balance).toBe(20_000 - 870);
    const loanEvent = curve.points[0].events.find(
      (e) =>
        e.kind === "loan" &&
        Math.abs(e.amount) === 870 &&
        e.informational !== true,
    );
    expect(
      loanEvent,
      "Car loan past-month installment must surface on day 0",
    ).toBeDefined();
  });

  it("future installments fire on their dayOfMonth in the curve", () => {
    const ctx = buildCtx();
    const curve = getLiquidityCurve(ctx, 60);

    // Studies loan — June 20 (in window).
    const studiesJune = curve.points
      .flatMap((p) => p.events)
      .find(
        (e) =>
          e.kind === "loan" &&
          e.whenISO.startsWith("2026-06-20") &&
          Math.abs(e.amount) === 2_700,
      );
    expect(studiesJune, "Studies June installment must fire").toBeDefined();

    // Car loan — July 5 (in window).
    const carJuly = curve.points
      .flatMap((p) => p.events)
      .find(
        (e) =>
          e.kind === "loan" &&
          e.whenISO.startsWith("2026-07-05") &&
          Math.abs(e.amount) === 870,
      );
    expect(carJuly, "Car July installment must fire").toBeDefined();
  });

  it("prints projection breakdown for LIVE / 10 / EOM / 2 next / 10 next", () => {
    const ctx = buildCtx();
    const curve = getLiquidityCurve(ctx, 60);

    function daysBetween(target: Date, now: Date): number {
      const a = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const b = new Date(
        target.getFullYear(),
        target.getMonth(),
        target.getDate(),
      );
      return Math.round((b.getTime() - a.getTime()) / 86_400_000);
    }
    const offsets = {
      LIVE: 0,
      "10 today":
        TODAY.getDate() <= 10
          ? daysBetween(new Date(TODAY.getFullYear(), TODAY.getMonth(), 10), TODAY)
          : daysBetween(
              new Date(TODAY.getFullYear(), TODAY.getMonth() + 1, 10),
              TODAY,
            ),
      "End Month": daysBetween(
        new Date(TODAY.getFullYear(), TODAY.getMonth() + 1, 0),
        TODAY,
      ),
      "2 next": daysBetween(
        new Date(TODAY.getFullYear(), TODAY.getMonth() + 1, 2),
        TODAY,
      ),
      "10 next": daysBetween(
        new Date(TODAY.getFullYear(), TODAY.getMonth() + 1, 10),
        TODAY,
      ),
    };

    const table: Array<Record<string, string | number>> = [];
    let totalLoanImpactAcrossChips = 0;
    for (const [chip, offset] of Object.entries(offsets)) {
      const clamped = Math.min(offset, curve.points.length - 1);
      const point = curve.points[clamped];
      let loans = 0;
      for (let i = 0; i <= clamped; i++) {
        for (const ev of curve.points[i].events) {
          if (ev.kind === "loan") loans += Math.abs(ev.amount);
        }
      }
      totalLoanImpactAcrossChips += loans;
      table.push({
        chip,
        offset: clamped,
        selectedDate: point.whenISO.slice(0, 10),
        loans,
        balance: point.balance,
      });
    }
    // eslint-disable-next-line no-console
    console.table(table);

    // LIVE / 10 today / End Month / 2 next month all show Car (past)
    // — the 870 ILS Car installment surfaces on day 0 regardless of
    // chip. Studies (June 20) appears from End-Month onward. 10 next
    // adds Car July 5 (3rd installment in window).
    const live = table[0];
    const day10 = table[1];
    const eom = table[2];
    const next2 = table[3];
    const next10 = table[4];

    expect(live.loans, "LIVE includes Car past installment (870)").toBe(870);
    // Today is June 11, the "10" chip resolves to next month's 10th.
    // Cumulative loans through July 10 = Car-June + Studies-June + Car-July.
    expect(day10.loans, '"10" on June 11 → July 10 chip').toBe(4_440);
    expect(eom.loans, "EOM includes Car + Studies (870 + 2,700)").toBe(3_570);
    expect(next2.loans, "2 next month: same as EOM (Car July not yet)").toBe(
      3_570,
    );
    expect(
      next10.loans,
      "10 next month: + Car July 5 (3,570 + 870 = 4,440)",
    ).toBe(4_440);

    // Pin: car (870) appears.
    const carRows = curve.points
      .flatMap((p) => p.events)
      .filter((e) => e.kind === "loan" && Math.abs(e.amount) === 870);
    expect(carRows.length).toBeGreaterThanOrEqual(1);
    // Pin: studies (2700) appears.
    const studiesRows = curve.points
      .flatMap((p) => p.events)
      .filter((e) => e.kind === "loan" && Math.abs(e.amount) === 2_700);
    expect(studiesRows.length).toBeGreaterThanOrEqual(1);

    // Pin: total active monthly loan payments === 3,570 ILS.
    expect(CAR_LOAN.monthlyInstallment + STUDIES_LOAN.monthlyInstallment).toBe(
      3_570,
    );
    void totalLoanImpactAcrossChips;
  });
});
