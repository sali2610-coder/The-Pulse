import { test, expect } from "@playwright/test";

const SAMPLE_CSV = `תאריך עסקה,שם בית עסק,סכום חיוב,4 ספרות אחרונות
01/05/2026,שופרסל דיל סניף 12,1500,1234
02/05/2026,פז 109,200,1234
03/05/2026,קפה ביאליק,45.50,1234
04/05/2026,ZARA NETANYA,890,5678
05/05/2026,Netflix,55,5678`;

async function setBudget(page: import("@playwright/test").Page, amount: string) {
  await page.getByRole("tab", { name: "הגדרות" }).click();
  const input = page.getByLabel("סכום תקציב");
  await input.fill(amount);
  await page.getByRole("button", { name: "שמור" }).click();
}

async function importCsv(
  page: import("@playwright/test").Page,
  csv: string,
  issuer: "CAL" | "MAX",
) {
  await page.getByRole("tab", { name: "הגדרות" }).click();
  await page.getByRole("button", { name: issuer }).click();
  await page.setInputFiles('input[type="file"]', {
    name: "statement.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv, "utf-8"),
  });
  // Preview shows up; click "ייבא N".
  await page.getByRole("button", { name: /ייבא/ }).click();
}

test.describe("Sally — Statement Importer + Pulse hardening", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.clear();
    });
    await page.goto("/");
  });

  test("end-to-end: budget → import → Pulse turns red on overspend", async ({
    page,
  }) => {
    // Very tight budget so any import breaches it (only past slices count
    // as `actual`, but we want the status well into yellow/red regardless of
    // the day in the month the test happens to run on).
    await setBudget(page, "1000");
    await importCsv(page, SAMPLE_CSV, "CAL");

    // Toast confirms import.
    await expect(page.getByText(/יובאו \d+ עסקאות/)).toBeVisible({
      timeout: 5000,
    });

    // Back to dashboard. Pulse status should be in the warning band.
    await page.getByRole("tab", { name: "לוח" }).click();

    // Yellow/red/over labels — we don't pin to one because the date affects
    // how many slices are counted as `actual`.
    await expect(
      page.getByText(/חריגה מהיעד|קרוב לגבול|להאט/),
    ).toBeVisible();

    // Forecast detail card visible. Two elements share this label (one
    // in the StatsCards header, one in the Forecast detail block) — both
    // valid surfaces, so we just assert at least one is visible.
    await expect(
      page.getByText("צפי לסוף חודש").first(),
    ).toBeVisible();
  });

  test("re-importing the same CSV doesn't double-charge (dedup)", async ({
    page,
  }) => {
    await setBudget(page, "10000");

    // First import.
    await importCsv(page, SAMPLE_CSV, "CAL");
    await page.getByText(/יובאו \d+ עסקאות/).waitFor({ timeout: 5000 });

    await page.getByRole("tab", { name: "לוח" }).click();
    // Capture the actual amount from the Pulse big number.
    const pulseValueLocator = page
      .locator("section")
      .filter({ hasText: "The Pulse" })
      .locator('[data-mono="true"]')
      .first();
    const firstActual = await pulseValueLocator.textContent();

    // Second import — same CSV. Toast should report 0 added or only dups.
    await importCsv(page, SAMPLE_CSV, "CAL");
    await expect(
      page.getByText(/(יובאו 0 עסקאות|כפילויות דולגו)/),
    ).toBeVisible({ timeout: 5000 });

    await page.getByRole("tab", { name: "לוח" }).click();
    const secondActual = await pulseValueLocator.textContent();

    expect(secondActual).toBe(firstActual);
  });

  test("History tab populates after import", async ({ page }) => {
    await setBudget(page, "8000");
    await importCsv(page, SAMPLE_CSV, "CAL");
    await page.getByText(/יובאו \d+ עסקאות/).waitFor({ timeout: 5000 });

    await page.getByRole("tab", { name: "היסטוריה" }).click();
    await expect(page.getByText("חודש מול חודש")).toBeVisible();
    await expect(page.getByText("מגמות קטגוריה")).toBeVisible();
  });

  test("Daily Allowance appears once a budget is set", async ({ page }) => {
    await setBudget(page, "6000");
    await page.getByRole("tab", { name: "לוח" }).click();
    await expect(page.getByText("מותר היום")).toBeVisible();
  });

  test("Manual entry: dialog → submit → Pulse reflects amount", async ({
    page,
  }) => {
    await setBudget(page, "5000");
    await page.getByRole("tab", { name: "לוח" }).click();
    await page.getByRole("button", { name: /תיעוד הוצאה חדשה/ }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await page
      .getByRole("textbox", { name: "סכום ההוצאה בשקלים" })
      .fill("250");
    await page.getByRole("radio", { name: /אוכל/ }).click();
    await page.getByRole("button", { name: /^שמור הוצאה$/ }).click();
    await expect(dialog).toBeHidden({ timeout: 5_000 });
    // 250 / 5000 = 5%
    await expect(page.getByText(/5% מהיעד/)).toBeVisible();
  });
});
