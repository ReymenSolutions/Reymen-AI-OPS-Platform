// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestOrg, createTestUser, fakeSession, cleanupOrg } from "@/test/helpers";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const authMock = vi.fn();
vi.mock("@/lib/auth", () => ({
  auth: () => authMock(),
  isAdmin: (role: string) => role === "SUPER_ADMIN" || role === "ADMIN",
}));

vi.mock("@/lib/email", () => ({ sendEmail: vi.fn().mockResolvedValue({ sent: true }) }));
const { sendEmail } = await import("@/lib/email");
const { createRequest } = await import("./requests");

describe("requests actions", () => {
  let org: { id: string };
  let owner: { id: string };
  let admin: { id: string; email: string };

  beforeAll(async () => {
    org = await createTestOrg("Requests Test Org");
    owner = await createTestUser(org.id, "OWNER", "req-owner");
    admin = await createTestUser(null, "ADMIN", "req-admin");
  });

  beforeEach(() => {
    (sendEmail as ReturnType<typeof vi.fn>).mockClear();
  });

  afterAll(async () => {
    await cleanupOrg(org.id);
    await prisma.user.delete({ where: { id: admin.id } });
  });

  it("creates a request scoped to the caller's organization and notifies admins", async () => {
    authMock.mockResolvedValue(fakeSession({ id: owner.id, role: "OWNER", organizationId: org.id }));
    const fd = new FormData();
    fd.set("title", "Necesito una nueva automatización");
    fd.set("description", "Quisiera automatizar el seguimiento de leads fríos");
    fd.set("type", "new_automation");

    const result = await createRequest(fd);
    expect(result.success).toBe(true);

    const created = await prisma.request.findFirst({ where: { organizationId: org.id } });
    expect(created?.title).toBe("Necesito una nueva automatización");

    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: admin.email, subject: expect.stringContaining("Nueva solicitud") })
    );
  });
});
