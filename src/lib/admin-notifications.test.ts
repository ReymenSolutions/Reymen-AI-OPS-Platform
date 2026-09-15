// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestUser } from "@/test/helpers";

vi.mock("@/lib/email", () => ({ sendEmail: vi.fn().mockResolvedValue({ sent: true }) }));
const { sendEmail } = await import("@/lib/email");
const { notifyAdmins } = await import("./admin-notifications");

describe("notifyAdmins", () => {
  let admin1: { id: string; email: string };
  let admin2: { id: string; email: string };
  let inactiveAdmin: { id: string; email: string };
  let regularUser: { id: string; email: string };

  beforeAll(async () => {
    admin1 = await createTestUser(null, "SUPER_ADMIN", "notify-admin1");
    admin2 = await createTestUser(null, "ADMIN", "notify-admin2");
    inactiveAdmin = await createTestUser(null, "ADMIN", "notify-admin-inactive");
    await prisma.user.update({ where: { id: inactiveAdmin.id }, data: { isActive: false } });
    regularUser = await createTestUser(null, "OWNER", "notify-owner");
  });

  beforeEach(() => {
    (sendEmail as ReturnType<typeof vi.fn>).mockClear();
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { id: { in: [admin1.id, admin2.id, inactiveAdmin.id, regularUser.id] } },
    });
  });

  it("emails every active SUPER_ADMIN and ADMIN, skipping inactive admins and non-admin roles", async () => {
    await notifyAdmins({ subject: "Test", html: "<p>hi</p>", text: "hi" });

    const calledTo = (sendEmail as ReturnType<typeof vi.fn>).mock.calls.map((call) => call[0].to);
    expect(calledTo).toContain(admin1.email);
    expect(calledTo).toContain(admin2.email);
    expect(calledTo).not.toContain(inactiveAdmin.email);
    expect(calledTo).not.toContain(regularUser.email);
  });

  it("does not throw when an individual send fails", async () => {
    (sendEmail as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("boom"));
    await expect(notifyAdmins({ subject: "Test", html: "<p>hi</p>" })).resolves.toBeUndefined();
  });
});
