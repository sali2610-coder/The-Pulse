import { describe, expect, it } from "vitest";

import {
  buildWalletPassEnvelope,
  DEFAULT_BUILDER_CONFIG,
  type WalletPassSnapshotData,
} from "@/lib/wallet-pass";

const SNAP: WalletPassSnapshotData = {
  monthKey: "2026-05",
  actualILS: 4200,
  projectedILS: 8800,
  budgetILS: 10000,
  forecastEomILS: 1500,
  generatedAt: "2026-05-15T08:00:00.000Z",
};

describe("buildWalletPassEnvelope", () => {
  it("produces both apple + google payloads from a single snapshot", () => {
    const env = buildWalletPassEnvelope({ snapshot: SNAP });
    expect(env.kind).toBe("monthly_snapshot");
    expect(env.snapshot).toEqual(SNAP);
    expect(env.apple.formatVersion).toBe(1);
    expect(env.google.state).toBe("ACTIVE");
  });

  it("derives a deterministic serial number from monthKey + date", () => {
    const a = buildWalletPassEnvelope({ snapshot: SNAP });
    const b = buildWalletPassEnvelope({ snapshot: SNAP });
    expect(a.apple.serialNumber).toBe(b.apple.serialNumber);
    expect(a.apple.serialNumber).toContain("2026-05");
    expect(a.google.id).toContain(a.apple.serialNumber);
  });

  it("honors config overrides without mutating defaults", () => {
    const env = buildWalletPassEnvelope({
      snapshot: SNAP,
      config: {
        applePassTypeIdentifier: "pass.test.override",
        organizationName: "Override Org",
      },
    });
    expect(env.apple.passTypeIdentifier).toBe("pass.test.override");
    expect(env.apple.organizationName).toBe("Override Org");
    expect(DEFAULT_BUILDER_CONFIG.applePassTypeIdentifier).toBe(
      "pass.com.thepulse.snapshot",
    );
  });

  it("shows '—' for budget fields when no budget set", () => {
    const env = buildWalletPassEnvelope({
      snapshot: { ...SNAP, budgetILS: 0 },
    });
    const budgetField = env.apple.generic.secondaryFields.find(
      (f) => f.key === "budget",
    );
    expect(budgetField?.value).toBe("—");
    const burnField = env.apple.generic.auxiliaryFields.find(
      (f) => f.key === "burn",
    );
    expect(burnField?.value).toBe("—");
  });

  it("computes the burn ratio percent when budget is positive", () => {
    const env = buildWalletPassEnvelope({ snapshot: SNAP });
    const burn = env.apple.generic.auxiliaryFields.find(
      (f) => f.key === "burn",
    );
    expect(burn?.value).toBe("88%"); // 8800/10000
  });

  it("Google pass id matches the issuerId.serial convention", () => {
    const env = buildWalletPassEnvelope({ snapshot: SNAP });
    expect(env.google.id.startsWith(`${DEFAULT_BUILDER_CONFIG.googleIssuerId}.`)).toBe(
      true,
    );
    expect(env.google.classId).toContain("thepulse_monthly_snapshot");
  });
});
