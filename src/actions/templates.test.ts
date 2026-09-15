// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestOrg, createTestUser, fakeSession, cleanupOrg, generateWebhookSecret } from "@/test/helpers";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const authMock = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => authMock() }));

const { installTemplate, uninstallTemplate } = await import("./templates");

describe("templates actions", () => {
  let org: { id: string };
  let owner: { id: string };
  let template: { id: string };

  beforeAll(async () => {
    org = await createTestOrg("Templates Test Org");
    await prisma.organization.update({ where: { id: org.id }, data: { plan: "professional" } });
    owner = await createTestUser(org.id, "OWNER", "templates-owner");

    const created = await prisma.automationTemplate.create({
      data: {
        name: "Follow-up automático",
        description: "Sigue a los leads fríos",
        industry: "clinic",
        category: "follow_up",
        isPublished: true,
        versions: {
          create: {
            version: "1.0.0",
            n8nWorkflowJson: {},
            isLatest: true,
          },
        },
      },
    });
    template = created;
  });

  afterAll(async () => {
    await prisma.templateInstallation.deleteMany({ where: { templateId: template.id } });
    await prisma.templateVersion.deleteMany({ where: { templateId: template.id } });
    await prisma.automationTemplate.delete({ where: { id: template.id } });
    await cleanupOrg(org.id);
  });

  it("installs a published template, creating an Automation and marking it ACTIVE", async () => {
    authMock.mockResolvedValue(fakeSession({ id: owner.id, role: "OWNER", organizationId: org.id }));
    const result = await installTemplate({ templateId: template.id });
    expect(result.success).toBe(true);

    const installation = await prisma.templateInstallation.findUnique({
      where: { organizationId_templateId: { organizationId: org.id, templateId: template.id } },
    });
    expect(installation?.status).toBe("ACTIVE");
    expect(installation?.automationId).toBe(result.automationId);
  });

  it("rejects installing the same template twice while active", async () => {
    authMock.mockResolvedValue(fakeSession({ id: owner.id, role: "OWNER", organizationId: org.id }));
    await expect(installTemplate({ templateId: template.id })).rejects.toThrow(/ya está instalado/);
  });

  it("allows reinstalling after uninstall", async () => {
    authMock.mockResolvedValue(fakeSession({ id: owner.id, role: "OWNER", organizationId: org.id }));
    await uninstallTemplate(template.id);
    const result = await installTemplate({ templateId: template.id });
    expect(result.success).toBe(true);
  });

  it("blocks installing a template once the org's automations plan limit is reached", async () => {
    const limitedOrg = await createTestOrg("Templates Plan Limit Org");
    await prisma.organization.update({ where: { id: limitedOrg.id }, data: { plan: "starter" } });
    const limitedOwner = await createTestUser(limitedOrg.id, "OWNER", "limited-owner");
    authMock.mockResolvedValue(fakeSession({ id: limitedOwner.id, role: "OWNER", organizationId: limitedOrg.id }));

    await prisma.automation.createMany({
      data: Array.from({ length: 3 }, (_, i) => ({
        organizationId: limitedOrg.id,
        name: `Automation ${i}`,
        type: "custom",
        webhookSecret: generateWebhookSecret(),
      })),
    });

    await expect(installTemplate({ templateId: template.id })).rejects.toThrow(/límite de automatizaciones/);

    await cleanupOrg(limitedOrg.id);
  });

  it("blocks installing a template when the org's AUTOMATIONS module isn't enabled", async () => {
    const noModuleOrg = await createTestOrg("Templates No Module Org");
    await prisma.organizationModule.update({
      where: { organizationId_module: { organizationId: noModuleOrg.id, module: "AUTOMATIONS" } },
      data: { status: "CANCELLED" },
    });
    const noModuleOwner = await createTestUser(noModuleOrg.id, "OWNER", "no-module-owner");
    authMock.mockResolvedValue(fakeSession({ id: noModuleOwner.id, role: "OWNER", organizationId: noModuleOrg.id }));

    await expect(installTemplate({ templateId: template.id })).rejects.toThrow(/módulo/i);

    await cleanupOrg(noModuleOrg.id);
  });
});
