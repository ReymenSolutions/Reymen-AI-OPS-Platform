import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();
const TEST_EMAIL = "e2e-live-revocation@example.com";
const TEST_PASSWORD = "LiveRevocation123";

test.describe("live session revocation", () => {
  test.afterEach(async () => {
    await prisma.user.deleteMany({ where: { email: TEST_EMAIL } });
  });

  test("deactivating a user kicks their existing session out on the next request, without re-login", async ({ page }) => {
    const org = await prisma.organization.findFirstOrThrow({ where: { name: "Clínica San Rafael" } });
    const passwordHash = await bcrypt.hash(TEST_PASSWORD, 12);
    await prisma.user.create({
      data: { email: TEST_EMAIL, name: "E2E Revocation", role: "AGENT", organizationId: org.id, passwordHash },
    });

    await page.goto("/login");
    await page.fill('input[type="email"]', TEST_EMAIL);
    await page.fill('input[type="password"]', TEST_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15_000 });

    await page.goto("/portal/dashboard");
    await expect(page).toHaveURL(/\/portal\/dashboard/);

    // Deactivate out-of-band — the browser's session cookie is never touched.
    await prisma.user.update({ where: { email: TEST_EMAIL }, data: { isActive: false } });

    await page.goto("/portal/leads");
    await expect(page).toHaveURL(/\/login/);
  });
});
