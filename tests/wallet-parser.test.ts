import { describe, expect, it } from "vitest";
import { parseWalletNotification } from "@/lib/parsers/wallet";

describe("parseWalletNotification", () => {
  it("parses an Apple Pay shorthand notification with ₪ prefix", () => {
    const r = parseWalletNotification({
      title: "Apple Pay",
      body: "Shufersal · ₪42.90",
    });
    if (!r.ok) throw new Error("expected ok");
    expect(r.result.amount).toBe(42.9);
    expect(r.result.merchant).toBe("Shufersal");
    expect(r.result.applePay).toBe(true);
    expect(r.result.currency).toBe("ILS");
  });

  it("parses Hebrew Wallet body with ש\"ח suffix", () => {
    const r = parseWalletNotification({
      title: "אפל פיי",
      body: "שופרסל, 42.90 ש\"ח",
    });
    if (!r.ok) throw new Error("expected ok");
    expect(r.result.amount).toBe(42.9);
    expect(r.result.merchant).toBe("שופרסל");
    expect(r.result.applePay).toBe(true);
    expect(r.result.currency).toBe("ILS");
  });

  it("flags foreign currency without crashing", () => {
    const r = parseWalletNotification({
      title: "Apple Pay",
      body: "Cofix · $12.40",
    });
    if (!r.ok) throw new Error("expected ok");
    expect(r.result.amount).toBe(12.4);
    expect(r.result.currency).toBe("USD");
  });

  it("extracts cardLast4 from a Visa-style notification", () => {
    const r = parseWalletNotification({
      title: "Visa ····1234",
      body: "Cofix 42.90 ILS",
    });
    if (!r.ok) throw new Error("expected ok");
    expect(r.result.cardLast4).toBe("1234");
    expect(r.result.amount).toBe(42.9);
  });

  it("returns ok with no merchant when notification body is minimal", () => {
    const r = parseWalletNotification({
      title: "Apple Pay",
      body: "₪15",
    });
    if (!r.ok) throw new Error("expected ok — amount alone is sufficient");
    expect(r.result.amount).toBe(15);
    expect(r.result.merchant).toBeUndefined();
  });

  it("fails when amount cannot be extracted", () => {
    const r = parseWalletNotification({
      title: "Apple Pay",
      body: "Shufersal",
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("incomplete_wallet_notification");
    expect(r.missing).toContain("amount");
  });

  it("uses receivedAt for occurredAt when provided", () => {
    const ts = Date.UTC(2026, 4, 15, 10, 30, 0);
    const r = parseWalletNotification({
      title: "Apple Pay",
      body: "₪10",
      receivedAt: ts,
    });
    if (!r.ok) throw new Error("expected ok");
    expect(new Date(r.result.occurredAt).getTime()).toBe(ts);
  });

  it("detects refunds", () => {
    const r = parseWalletNotification({
      title: "Apple Pay",
      body: "Shufersal · זיכוי · ₪42.90",
    });
    if (!r.ok) throw new Error("expected ok");
    expect(r.result.isRefund).toBe(true);
  });
});
