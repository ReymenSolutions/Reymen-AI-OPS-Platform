import { test, expect } from "@playwright/test";

test.describe("authentication", () => {
  test("rejects invalid credentials with a visible error", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[type="email"]', "nobody@example.com");
    await page.fill('input[type="password"]', "wrong-password");
    await page.click('button[type="submit"]');
    await expect(page.getByText(/credenciales incorrectas/i)).toBeVisible({ timeout: 10_000 });
    await expect(page).toHaveURL(/\/login/);
  });

  test("logs an admin in and redirects out of /login", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[type="email"]', "admin@reymen.io");
    await page.fill('input[type="password"]', "admin123456");
    await page.click('button[type="submit"]');
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15_000 });
    await expect(page).not.toHaveURL(/\/login/);
  });

  test("logs a portal client in and lands on the portal", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[type="email"]', "carlos@clinicasanrafael.com");
    await page.fill('input[type="password"]', "client123456");
    await page.click('button[type="submit"]');
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15_000 });
    await page.goto("/portal/dashboard");
    await expect(page).toHaveURL(/\/portal\/dashboard/);
  });

  test("unauthenticated visitors are redirected to /login from a protected route", async ({ page }) => {
    await page.goto("/portal/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });
});
