import { describe, expect, it } from "vitest";
import { parseSmsByIssuer } from "@/lib/parsers";
import {
  detectsRefund,
  detectsPending,
  detectsForeignCurrency,
} from "@/lib/parsers/helpers";

describe("detectsRefund", () => {
  it("detects Hebrew refund verbiage", () => {
    expect(detectsRefund("בוצע זיכוי בכרטיסך בסכום 50 ש\"ח")).toBe(true);
    expect(detectsRefund("התקבל החזר כספי")).toBe(true);
  });

  it("detects English variants", () => {
    expect(detectsRefund("REFUND credited to your card")).toBe(true);
    expect(detectsRefund("CREDIT issued for purchase")).toBe(true);
  });

  it("returns false for normal charges", () => {
    expect(detectsRefund("בוצעה עסקה בסכום 100 ש\"ח")).toBe(false);
  });
});

describe("detectsPending", () => {
  it("detects 'תלוי ועומד'", () => {
    expect(detectsPending("חיוב תלוי ועומד בכרטיסך")).toBe(true);
  });

  it("detects 'ממתין לאישור'", () => {
    expect(detectsPending("העסקה ממתינה לאישור")).toBe(false); // ממתינה not ממתין
    expect(detectsPending("סטטוס: ממתין לאישור")).toBe(true);
  });

  it("detects English PENDING", () => {
    expect(detectsPending("Charge PENDING approval")).toBe(true);
  });
});

describe("detectsForeignCurrency", () => {
  it("returns USD when dollar sign present", () => {
    expect(detectsForeignCurrency("Charge of $19.99 at Apple")).toBe("USD");
  });

  it("returns EUR with euro symbol", () => {
    expect(detectsForeignCurrency("חיוב של €25 בחו\"ל")).toBe("EUR");
  });

  it("returns null for ILS-only SMS", () => {
    expect(
      detectsForeignCurrency('בוצעה עסקה בסכום 150.50 ש"ח'),
    ).toBeNull();
  });

  it("flags FX even when ILS appears alongside (dual-quote SMS)", () => {
    expect(
      detectsForeignCurrency('חיוב $19.99 שווה ערך 75 ש"ח'),
    ).toBe("USD");
  });
});

describe("parseSmsByIssuer — edge cases surface in result", () => {
  it("flags refund + sanitizes merchant", () => {
    const sms =
      'בוצע זיכוי בכרטיסך המסתיימת ב-1234 בבית עסק \'שופרסל דיל סניף 123\' בסכום 99 ש"ח בתאריך 02/05/26.';
    const r = parseSmsByIssuer("cal", sms);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.result.isRefund).toBe(true);
    expect(r.result.merchant).toBe("שופרסל");
    expect(r.result.merchantRaw).toContain("דיל");
  });

  it("flags pending charge", () => {
    const sms =
      'חיוב תלוי ועומד בכרטיסך המסתיימת ב-1234 בבית עסק \'נסיעה\' בסכום 50 ש"ח בתאריך 03/05/26.';
    const r = parseSmsByIssuer("cal", sms);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.result.pending).toBe(true);
  });

  it("flags foreign currency on dual-quote SMS", () => {
    // Real FX charges include both the foreign amount and the ILS-converted
    // value: "$19.99 שווה 75 ש"ח". We detect FX even though the body parses
    // as ILS.
    const sms =
      "הודעה ממקס: חיוב $19.99 בבית עסק 'Netflix' בסכום 75 ש\"ח בכרטיס שמספרו מסתיים ב-5678.";
    const r = parseSmsByIssuer("max", sms);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.result.currency).toBe("USD");
    expect(r.result.merchant).toBe("Netflix");
  });
});
