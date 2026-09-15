// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import * as OTPAuth from "otpauth";
import { prisma } from "@/lib/prisma";
import { fakeSession } from "@/test/helpers";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const authMock = vi.fn();
vi.mock("@/lib/auth", () => ({
  auth: () => authMock(),
  isAdmin: (role: string) => role === "SUPER_ADMIN" || role === "ADMIN",
}));

const { start2FAEnrollment, confirm2FAEnrollment, disable2FA, get2FAStatus } = await import("./two-factor");

function codeFor(secret: string): string {
  return new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(secret) }).generate();
}

describe("two-factor actions", () => {
  let adminId: string;

  beforeAll(async () => {
    const admin = await prisma.user.create({
      data: {
        email: `2fa-admin.${Date.now()}@test.local`,
        name: "2FA Admin",
        role: "SUPER_ADMIN",
        passwordHash: await import("bcryptjs").then((b) => b.hash("adminPass123", 12)),
      },
    });
    adminId = admin.id;
  });

  afterAll(async () => {
    await prisma.user.delete({ where: { id: adminId } });
  });

  it("denies enrollment to a non-admin session", async () => {
    authMock.mockResolvedValue(fakeSession({ id: adminId, role: "OWNER", organizationId: null }));
    await expect(start2FAEnrollment()).rejects.toThrow(/autorizado/i);
  });

  it("full enrollment: start -> confirm with valid code -> enabled + backup codes issued", async () => {
    authMock.mockResolvedValue(fakeSession({ id: adminId, role: "SUPER_ADMIN", organizationId: null }));

    const before = await get2FAStatus();
    expect(before.enabled).toBe(false);

    const { secret, qrCodeDataUrl } = await start2FAEnrollment();
    expect(secret.length).toBeGreaterThan(0);
    expect(qrCodeDataUrl).toMatch(/^data:image\/png;base64,/);

    const result = await confirm2FAEnrollment(codeFor(secret));
    expect(result.backupCodes).toHaveLength(8);

    const after = await get2FAStatus();
    expect(after.enabled).toBe(true);
    expect(after.remainingBackupCodes).toBe(8);

    const user = await prisma.user.findUniqueOrThrow({ where: { id: adminId } });
    // Only hashes are ever persisted, never the plaintext codes.
    for (const code of result.backupCodes) {
      expect(user.totpBackupCodeHashes.join(" ")).not.toContain(code);
    }
  });

  it("rejects confirming enrollment with a wrong code", async () => {
    authMock.mockResolvedValue(fakeSession({ id: adminId, role: "SUPER_ADMIN", organizationId: null }));
    await start2FAEnrollment();
    await expect(confirm2FAEnrollment("000000")).rejects.toThrow(/inválido/i);
  });

  it("disable requires the correct password", async () => {
    authMock.mockResolvedValue(fakeSession({ id: adminId, role: "SUPER_ADMIN", organizationId: null }));
    const { secret } = await start2FAEnrollment();
    await confirm2FAEnrollment(codeFor(secret));

    await expect(disable2FA("wrong-password")).rejects.toThrow(/incorrecta/i);
    expect((await get2FAStatus()).enabled).toBe(true);

    await disable2FA("adminPass123");
    expect((await get2FAStatus()).enabled).toBe(false);

    const user = await prisma.user.findUniqueOrThrow({ where: { id: adminId } });
    expect(user.totpSecret).toBeNull();
    expect(user.totpBackupCodeHashes).toHaveLength(0);
  });
});
