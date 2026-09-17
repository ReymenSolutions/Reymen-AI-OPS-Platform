// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestOrg, createTestUser, fakeSession, cleanupOrg } from "@/test/helpers";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const authMock = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => authMock() }));

const { skipOnboarding } = await import("./onboarding");

describe("skipOnboarding", () => {
  let org: { id: string };
  let owner: { id: string };

  beforeAll(async () => {
    org = await createTestOrg("Skip Onboarding Org");
    owner = await createTestUser(org.id, "OWNER", "skip-onboarding-owner");
  });

  afterAll(async () => {
    await cleanupOrg(org.id);
  });

  it("rejects with no session", async () => {
    authMock.mockResolvedValue(null);
    await expect(skipOnboarding()).rejects.toThrow();
  });

  it("marks the org's onboarding complete even if no checklist step is actually done", async () => {
    authMock.mockResolvedValue(fakeSession({ id: owner.id, role: "OWNER", organizationId: org.id }));

    const before = await prisma.organization.findUniqueOrThrow({ where: { id: org.id }, select: { onboardingCompletedAt: true } });
    expect(before.onboardingCompletedAt).toBeNull();

    const result = await skipOnboarding();
    expect(result.success).toBe(true);

    const after = await prisma.organization.findUniqueOrThrow({ where: { id: org.id }, select: { onboardingCompletedAt: true } });
    expect(after.onboardingCompletedAt).not.toBeNull();
  });

  it("is idempotent — calling it again keeps working without error", async () => {
    authMock.mockResolvedValue(fakeSession({ id: owner.id, role: "OWNER", organizationId: org.id }));
    await expect(skipOnboarding()).resolves.toMatchObject({ success: true });
  });
});
