// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestOrg, cleanupOrg, fakeSession } from "@/test/helpers";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const authMock = vi.fn();
vi.mock("@/lib/auth", () => ({
  auth: () => authMock(),
  isAdmin: (role: string) => role === "SUPER_ADMIN" || role === "ADMIN",
}));

const { installTemplateForClient } = await import("./templates");

describe("installTemplateForClient", () => {
  let org: { id: string };
  let template: { id: string };
  let v1: { id: string; version: string };
  let v2: { id: string; version: string };

  beforeAll(async () => {
    org = await createTestOrg("Install For Client Test Org");
    template = await prisma.automationTemplate.create({
      data: {
        name: "Recordatorio de citas", description: "Envía recordatorios", industry: "clinic",
        category: "appointments", isPublished: true,
        versions: {
          create: [
            { version: "1.0.0", n8nWorkflowJson: {}, n8nWorkflowId: "wf-v1", isLatest: false },
            { version: "1.1.0", n8nWorkflowJson: {}, n8nWorkflowId: "wf-v2", isLatest: true },
          ],
        },
      },
    });
    const versions = await prisma.templateVersion.findMany({
      where: { templateId: template.id },
      orderBy: { version: "asc" },
    });
    v1 = versions[0];
    v2 = versions[1];
  });

  afterAll(async () => {
    await prisma.templateInstallation.deleteMany({ where: { templateId: template.id } });
    await prisma.templateVersion.deleteMany({ where: { templateId: template.id } });
    await prisma.automationTemplate.delete({ where: { id: template.id } });
    await cleanupOrg(org.id);
  });

  it("denies a non-admin session", async () => {
    authMock.mockResolvedValue(fakeSession({ id: "u1", role: "OWNER", organizationId: null }));
    await expect(installTemplateForClient(org.id, template.id, v2.id)).rejects.toThrow(/autorizado/i);
  });

  it("lets an admin pin a specific (non-latest) version for a client", async () => {
    authMock.mockResolvedValue(fakeSession({ id: "admin1", role: "SUPER_ADMIN", organizationId: null }));
    const result = await installTemplateForClient(org.id, template.id, v1.id);
    expect(result.success).toBe(true);

    const installation = await prisma.templateInstallation.findUnique({
      where: { organizationId_templateId: { organizationId: org.id, templateId: template.id } },
    });
    expect(installation?.versionId).toBe(v1.id);
    expect(installation?.status).toBe("ACTIVE");
    expect(installation?.automationId).toBe(result.automationId);

    const automation = await prisma.automation.findUnique({ where: { id: result.automationId } });
    expect(automation?.n8nWorkflowId).toBe("wf-v1");
  });

  it("rejects installing again while already active", async () => {
    authMock.mockResolvedValue(fakeSession({ id: "admin1", role: "SUPER_ADMIN", organizationId: null }));
    await expect(installTemplateForClient(org.id, template.id, v2.id)).rejects.toThrow(/ya está instalado/);
  });

  it("upgrades the pinned version after uninstalling and reinstalling", async () => {
    authMock.mockResolvedValue(fakeSession({ id: "admin1", role: "SUPER_ADMIN", organizationId: null }));
    const installation = await prisma.templateInstallation.findUniqueOrThrow({
      where: { organizationId_templateId: { organizationId: org.id, templateId: template.id } },
    });
    await prisma.templateInstallation.update({ where: { id: installation.id }, data: { status: "UNINSTALLED" } });

    const result = await installTemplateForClient(org.id, template.id, v2.id);
    expect(result.success).toBe(true);

    const updated = await prisma.templateInstallation.findUnique({
      where: { organizationId_templateId: { organizationId: org.id, templateId: template.id } },
    });
    expect(updated?.versionId).toBe(v2.id);
  });

  it("rejects a nonexistent client org", async () => {
    authMock.mockResolvedValue(fakeSession({ id: "admin1", role: "SUPER_ADMIN", organizationId: null }));
    await expect(installTemplateForClient("nonexistent-org-id", template.id, v2.id)).rejects.toThrow(/no encontrado/i);
  });

  it("rejects a nonexistent version", async () => {
    authMock.mockResolvedValue(fakeSession({ id: "admin1", role: "SUPER_ADMIN", organizationId: null }));
    await expect(installTemplateForClient(org.id, template.id, "nonexistent-version-id")).rejects.toThrow(/versión no encontrada/i);
  });
});
