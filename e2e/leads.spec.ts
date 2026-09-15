import { test, expect } from "@playwright/test";

test.describe("leads", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[type="email"]', "carlos@clinicasanrafael.com");
    await page.fill('input[type="password"]', "client123456");
    await page.click('button[type="submit"]');
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15_000 });
  });

  test("creates a lead and it appears in the table", async ({ page }) => {
    await page.goto("/portal/leads");
    const before = await page.locator("table tbody tr").count();

    await page.getByRole("button", { name: /nuevo lead/i }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    const leadName = `E2E Lead ${Date.now()}`;
    await dialog.locator("input").first().fill(leadName);
    await dialog.locator('button[type="submit"]').click();

    await expect(dialog).toBeHidden({ timeout: 10_000 });
    await expect(page.locator("table tbody tr")).toHaveCount(before + 1);
    await expect(page.getByText(leadName)).toBeVisible();
  });

  test("rejects an empty lead name client-side", async ({ page }) => {
    await page.goto("/portal/leads");
    await page.getByRole("button", { name: /nuevo lead/i }).click();
    const dialog = page.getByRole("dialog");
    await dialog.locator('button[type="submit"]').click();
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/nombre requerido/i)).toBeVisible();
  });
});
