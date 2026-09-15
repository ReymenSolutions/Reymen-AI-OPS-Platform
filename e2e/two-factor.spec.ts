import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import * as OTPAuth from "otpauth";

const prisma = new PrismaClient();
const TEST_EMAIL = "e2e-2fa-admin@example.com";
const TEST_PASSWORD = "TwoFactorAdmin123";

test.describe("two-factor authentication", () => {
  test.beforeEach(async () => {
    const passwordHash = await bcrypt.hash(TEST_PASSWORD, 12);
    await prisma.user.upsert({
      where: { email: TEST_EMAIL },
      update: { totpEnabled: false, totpSecret: null, totpBackupCodeHashes: [], passwordHash },
      create: { email: TEST_EMAIL, name: "E2E 2FA Admin", role: "SUPER_ADMIN", passwordHash },
    });
    await prisma.rateLimitHit.deleteMany({ where: { key: { contains: TEST_EMAIL } } });
  });

  test.afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: TEST_EMAIL } });
  });

  test("enroll, then log in requiring a code — wrong code rejected, correct code and a backup code both work", async ({ page, context }) => {
    // --- Log in without 2FA yet ---
    await page.goto("/login");
    await page.fill('input[type="email"]', TEST_EMAIL);
    await page.fill('input[type="password"]', TEST_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15_000 });

    // --- Enroll ---
    await page.goto("/admin/settings");
    await page.getByRole("button", { name: /activar 2fa/i }).click();
    const secret = await page.locator("input[readonly]").inputValue();
    expect(secret.length).toBeGreaterThan(0);

    const totp = new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(secret) });
    await page.fill("#totp-confirm", totp.generate());
    await page.getByRole("button", { name: /verificar y activar/i }).click();

    await expect(page.getByText(/guarda tus códigos de respaldo/i)).toBeVisible({ timeout: 10_000 });
    const backupCodeLocators = page.locator("span", { hasText: /^[0-9A-F]{4}-[0-9A-F]{4}$/ });
    const backupCodeCount = await backupCodeLocators.count();
    const backupCode = await backupCodeLocators.first().innerText();
    expect(backupCodeCount).toBe(8);
    await page.getByRole("button", { name: /ya los guardé/i }).click();
    await expect(page.getByText(/2fa activado/i)).toBeVisible();

    // --- Fresh session: login now requires the second factor ---
    await context.clearCookies();
    await page.goto("/login");
    await page.fill('input[type="email"]', TEST_EMAIL);
    await page.fill('input[type="password"]', TEST_PASSWORD);
    await page.click('button[type="submit"]');
    await expect(page.getByText(/verificación en dos pasos/i)).toBeVisible({ timeout: 10_000 });
    await expect(page).toHaveURL(/\/login/);

    // Wrong code: rejected, stays on the TOTP step
    await page.fill("#totpCode", "000000");
    await page.getByRole("button", { name: /^verificar$/i }).click();
    await expect(page.getByText(/código inválido/i)).toBeVisible({ timeout: 10_000 });
    await expect(page).toHaveURL(/\/login/);

    // Correct TOTP code: succeeds
    await page.fill("#totpCode", totp.generate());
    await page.getByRole("button", { name: /^verificar$/i }).click();
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15_000 });

    // --- Another fresh session: a backup code works too, and is single-use ---
    await context.clearCookies();
    await prisma.rateLimitHit.deleteMany({ where: { key: { contains: TEST_EMAIL } } });
    await page.goto("/login");
    await page.fill('input[type="email"]', TEST_EMAIL);
    await page.fill('input[type="password"]', TEST_PASSWORD);
    await page.click('button[type="submit"]');
    await expect(page.getByText(/verificación en dos pasos/i)).toBeVisible({ timeout: 10_000 });

    await page.fill("#totpCode", backupCode);
    await page.getByRole("button", { name: /^verificar$/i }).click();
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15_000 });

    const user = await prisma.user.findUniqueOrThrow({ where: { email: TEST_EMAIL } });
    expect(user.totpBackupCodeHashes).toHaveLength(7);
  });
});
