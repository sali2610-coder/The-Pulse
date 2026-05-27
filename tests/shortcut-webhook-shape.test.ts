// Phase 246 — verify the iOS Shortcut webhook payload shape.
//
// Mirrors the zod schema inside the webhook route so the contract
// shipped to onboarding documentation stays in sync. The actual
// route handler is exercised by integration tests; this file
// pins the schema permissiveness.

import { describe, expect, it } from "vitest";
import { z } from "zod";

const shortcutBodySchema = z.object({
  issuer: z.literal("shortcut"),
  rawText: z.string().min(1).max(2_000),
  amount: z.number().positive().optional(),
  merchant: z.string().max(120).optional(),
  receivedAt: z.number().int().positive().optional(),
  deviceTime: z.string().max(40).optional(),
  appSource: z.enum(["wallet", "cal", "max", "unknown"]).optional(),
});

describe("shortcut webhook payload", () => {
  it("accepts a full payload with every optional field set", () => {
    const r = shortcutBodySchema.safeParse({
      issuer: "shortcut",
      rawText: "Apple Pay · Shufersal · ₪42.90",
      amount: 42.9,
      merchant: "Shufersal",
      receivedAt: 1715000000000,
      deviceTime: "2026-05-26T08:32:00Z",
      appSource: "wallet",
    });
    expect(r.success).toBe(true);
  });

  it("accepts a minimal payload with only rawText", () => {
    const r = shortcutBodySchema.safeParse({
      issuer: "shortcut",
      rawText: "Apple Pay · ₪1.00 · בדיקה",
    });
    expect(r.success).toBe(true);
  });

  it("rejects when issuer is wrong", () => {
    const r = shortcutBodySchema.safeParse({
      issuer: "wallet",
      rawText: "x",
    });
    expect(r.success).toBe(false);
  });

  it("rejects when rawText is empty", () => {
    const r = shortcutBodySchema.safeParse({
      issuer: "shortcut",
      rawText: "",
    });
    expect(r.success).toBe(false);
  });

  it("rejects an unrecognized appSource", () => {
    const r = shortcutBodySchema.safeParse({
      issuer: "shortcut",
      rawText: "x",
      appSource: "telegram",
    });
    expect(r.success).toBe(false);
  });

  it("treats amount as optional — partial data is OK", () => {
    const r = shortcutBodySchema.safeParse({
      issuer: "shortcut",
      rawText: "lo amount detected",
      merchant: "Cafe",
    });
    expect(r.success).toBe(true);
  });
});
