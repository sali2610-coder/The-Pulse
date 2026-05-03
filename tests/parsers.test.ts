import { describe, expect, it } from "vitest";
import { parseCal } from "@/lib/parsers/cal";
import { parseMax } from "@/lib/parsers/max";
import { parseSmsByIssuer } from "@/lib/parsers";

describe("parseCal", () => {
  it("parses the canonical CAL sample", () => {
    const sms =
      'לקוח יקר, בוצעה עסקה בכרטיסך המסתיימת ב-1234 בבית עסק \'שופרסל\' בסכום 150.50 ש"ח בתאריך 03/05/26.';
    const r = parseCal(sms);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.result.amount).toBe(150.5);
    expect(r.result.cardLast4).toBe("1234");
    expect(r.result.merchant).toBe("שופרסל");
    expect(r.result.applePay).toBe(false);
    // 03/05/26 → 2026-05-03 noon UTC
    expect(r.result.occurredAt.startsWith("2026-05-03")).toBe(true);
  });

  it("handles thousands separator and 2-decimal amount", () => {
    const sms =
      'בוצעה עסקה בכרטיסך המסתיימת ב-9999 בבית עסק "ZARA" בסכום 1,299.90 ש"ח בתאריך 02/05/26.';
    const r = parseCal(sms);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.result.amount).toBe(1299.9);
    expect(r.result.cardLast4).toBe("9999");
  });

  it("falls back to now when no date is in body", () => {
    const sms =
      'בוצעה עסקה בכרטיסך המסתיימת ב-1111 בבית עסק \'paz\' בסכום 220 ש"ח';
    const r = parseCal(sms);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // Today's ISO date should be there.
    expect(r.result.occurredAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("reports missing fields when SMS is unrecognized", () => {
    const r = parseCal("לקוח יקר, ברוך הבא לאתר.");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.missing).toEqual(
      expect.arrayContaining(["amount", "cardLast4", "merchant"]),
    );
  });
});

describe("parseMax", () => {
  it("parses the canonical Max sample with Apple Pay", () => {
    const sms =
      "הודעה ממקס: בוצעה עסקה ב-APPLE PAY בבית עסק 'דלק' בסכום 200 ש\"ח בכרטיס שמספרו מסתיים ב-5678.";
    const r = parseMax(sms);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.result.amount).toBe(200);
    expect(r.result.cardLast4).toBe("5678");
    expect(r.result.merchant).toBe("דלק");
    expect(r.result.applePay).toBe(true);
  });

  it("integer amount without trailing decimal", () => {
    const sms =
      'בוצעה עסקה ב-APPLE PAY בבית עסק \'super pharm\' בסכום 89 ש"ח בכרטיס שמספרו מסתיים ב-4321.';
    const r = parseMax(sms);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.result.amount).toBe(89);
    expect(r.result.applePay).toBe(true);
  });
});

describe("parseSmsByIssuer", () => {
  it("dispatches by issuer and adds category + issuer", () => {
    const sms =
      'בוצעה עסקה בכרטיסך המסתיימת ב-1234 בבית עסק \'שופרסל\' בסכום 75 ש"ח בתאריך 01/05/26.';
    const r = parseSmsByIssuer("cal", sms);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.result.issuer).toBe("cal");
    expect(r.result.category).toBe("food"); // שופרסל → food
  });

  it("rejects unknown issuer", () => {
    const r = parseSmsByIssuer("isracard", "anything");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("unknown_issuer");
  });

  it("classifies fuel station as transport", () => {
    const sms =
      "בוצעה עסקה ב-APPLE PAY בבית עסק 'דלק' בסכום 200 ש\"ח בכרטיס שמספרו מסתיים ב-5678.";
    const r = parseSmsByIssuer("max", sms);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.result.category).toBe("transport");
  });
});
