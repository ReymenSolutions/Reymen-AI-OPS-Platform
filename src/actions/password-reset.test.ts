// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { createTestOrg, createTestUser, cleanupOrg } from "@/test/helpers";

vi.mock("@/lib/email", () => ({ sendEmail: vi.fn().mockResolvedValue({ sent: true }) }));
const { sendEmail } = await import("@/lib/email");
const { requestPasswordReset, resetPassword } = await import("./password-reset");

describe("password reset flow", () => {
  let org: { id: string };
  let user: { id: string; email: string };

  beforeAll(async () => {
    org = await createTestOrg("Password Reset Org");
    user = await createTestUser(org.id, "OWNER", "pwreset");
  });

  // requestPasswordReset is itself rate-limited (3/hour/email, tested separately
  // in rate-limit.test.ts) — clear it here so these tests exercise the reset
  // flow itself, not that limit.
  beforeEach(async () => {
    await prisma.rateLimitHit.deleteMany({ where: { key: `password-reset:${user.email.toLowerCase()}` } });
  });

  afterAll(async () => {
    await prisma.verificationToken.deleteMany({ where: { identifier: user.email } });
    await cleanupOrg(org.id);
  });

  function extractToken(): string {
    const call = (sendEmail as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0] as { html: string };
    const match = call.html.match(/token=([a-f0-9]+)&/);
    if (!match) throw new Error("token not found in email body");
    return match[1];
  }

  it("does not error for an unknown email (avoids account enumeration)", async () => {
    const result = await requestPasswordReset("nobody-at-all@test.local");
    expect(result.success).toBe(true);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("sends a reset email with a working link for a known email", async () => {
    const result = await requestPasswordReset(user.email);
    expect(result.success).toBe(true);
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: user.email })
    );

    const token = extractToken();
    await resetPassword({ email: user.email, token, password: "brandNewPassword1" });

    const updated = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(await bcrypt.compare("brandNewPassword1", updated.passwordHash!)).toBe(true);
  });

  it("rejects reusing an already-consumed token", async () => {
    await requestPasswordReset(user.email);
    const token = extractToken();
    await resetPassword({ email: user.email, token, password: "secondPassword1" });

    await expect(
      resetPassword({ email: user.email, token, password: "thirdPassword1" })
    ).rejects.toThrow(/inválido o ha expirado/i);
  });

  it("rejects a token that doesn't match any request", async () => {
    await expect(
      resetPassword({ email: user.email, token: "totally-made-up-token", password: "whatever123" })
    ).rejects.toThrow(/inválido o ha expirado/i);
  });

  it("rejects an expired token", async () => {
    await requestPasswordReset(user.email);
    const token = extractToken();
    await prisma.verificationToken.updateMany({
      where: { identifier: user.email },
      data: { expires: new Date(Date.now() - 1000) },
    });

    await expect(
      resetPassword({ email: user.email, token, password: "expiredFlow123" })
    ).rejects.toThrow(/inválido o ha expirado/i);
  });

  it("issuing a new reset request invalidates the previous token", async () => {
    await requestPasswordReset(user.email);
    const firstToken = extractToken();

    await requestPasswordReset(user.email);
    const secondToken = extractToken();

    await expect(
      resetPassword({ email: user.email, token: firstToken, password: "shouldFail123" })
    ).rejects.toThrow(/inválido o ha expirado/i);

    await resetPassword({ email: user.email, token: secondToken, password: "shouldWork123" });
    const updated = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(await bcrypt.compare("shouldWork123", updated.passwordHash!)).toBe(true);
  });
});
