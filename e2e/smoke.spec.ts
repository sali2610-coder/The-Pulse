import { test, expect } from "@playwright/test";

test.describe("Sally — smoke flow", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("renders dashboard with Pulse and tabs", async ({ page }) => {
    await expect(
      page.getByRole("heading", { name: "תקציב נקי, החלטות חכמות." }),
    ).toBeVisible();
    await expect(page.getByText("The Pulse")).toBeVisible();
    await expect(page.getByText("Timeline Sync")).toBeVisible();
    await expect(page.getByRole("tab", { name: "לוח" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "ניתוח" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "הגדרות" })).toBeVisible();
  });

  test("records an expense and updates the Pulse", async ({ page }) => {
    // Set a budget first via the Settings tab, so the Pulse has a denominator.
    await page.getByRole("tab", { name: "הגדרות" }).click();
    await page.getByLabel("סכום תקציב").fill("5000");
    await page.getByRole("button", { name: "שמור" }).click();

    // Back to dashboard.
    await page.getByRole("tab", { name: "לוח" }).click();

    // Open the new-expense dialog.
    await page.getByRole("button", { name: /תיעוד הוצאה חדשה/ }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    // Fill in 250 ILS, food category, credit (default).
    await page
      .getByRole("textbox", { name: "סכום ההוצאה בשקלים" })
      .fill("250");
    await page.getByRole("radio", { name: /אוכל/ }).click();

    // Submit.
    await page.getByRole("button", { name: /^שמור הוצאה$/ }).click();

    // Dialog auto-closes after success animation.
    await expect(dialog).toBeHidden({ timeout: 5_000 });

    // The Pulse should now reflect ~250 actual on a 5000 budget = 5%.
    await expect(page.getByText(/5% מהיעד/)).toBeVisible();
  });
});
