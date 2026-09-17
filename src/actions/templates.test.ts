// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestOrg, createTestUser, fakeSession, cleanupOrg, generateWebhookSecret } from "@/test/helpers";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const authMock = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => authMock() }));

const { installTemplate, uninstallTemplate, installTemplatePackage } = await import("./templates");

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

describe("installTemplatePackage", () => {
  let org: { id: string };
  let owner: { id: string };
  let templateA: { id: string };
  let templateB: { id: string };
  let unpublishedTemplate: { id: string };
  let pkg: { id: string };

  beforeAll(async () => {
    org = await createTestOrg("Template Package Test Org");
    await prisma.organization.update({ where: { id: org.id }, data: { plan: "professional" } });
    owner = await createTestUser(org.id, "OWNER", "package-owner");

    templateA = await prisma.automationTemplate.create({
      data: {
        name: "Captura de leads WhatsApp", description: "Captura leads", industry: "clinic",
        category: "lead_capture", isPublished: true,
        versions: { create: { version: "1.0.0", n8nWorkflowJson: {}, isLatest: true } },
      },
    });
    templateB = await prisma.automationTemplate.create({
      data: {
        name: "Recordatorio de citas", description: "Recuerda citas", industry: "clinic",
        category: "appointments", isPublished: true,
        versions: { create: { version: "1.0.0", n8nWorkflowJson: {}, isLatest: true } },
      },
    });
    unpublishedTemplate = await prisma.automationTemplate.create({
      data: {
        name: "Borrador sin publicar", description: "No listo", industry: "clinic",
        category: "retention", isPublished: false,
        versions: { create: { version: "1.0.0", n8nWorkflowJson: {}, isLatest: true } },
      },
    });

    pkg = await prisma.templatePackage.create({
      data: {
        name: "Paquete Clínica Test", description: "Paquete de prueba", industry: "clinic",
        isPublished: true,
        items: {
          create: [
            { templateId: templateA.id, order: 0 },
            { templateId: templateB.id, order: 1 },
            { templateId: unpublishedTemplate.id, order: 2 },
          ],
        },
      },
    });
  });

  afterAll(async () => {
    await prisma.templatePackageItem.deleteMany({ where: { packageId: pkg.id } });
    await prisma.templatePackage.delete({ where: { id: pkg.id } });
    for (const t of [templateA, templateB, unpublishedTemplate]) {
      await prisma.templateInstallation.deleteMany({ where: { templateId: t.id } });
      await prisma.templateVersion.deleteMany({ where: { templateId: t.id } });
      await prisma.automationTemplate.delete({ where: { id: t.id } });
    }
    await cleanupOrg(org.id);
  });

  it("installs every published template in the package, skipping the unpublished one", async () => {
    authMock.mockResolvedValue(fakeSession({ id: owner.id, role: "OWNER", organizationId: org.id }));
    const result = await installTemplatePackage(pkg.id);
    expect(result.success).toBe(true);
    expect(result.installedCount).toBe(2);
    expect(result.skippedCount).toBe(0);
    expect(result.limitReached).toBe(false);

    const installations = await prisma.templateInstallation.findMany({
      where: { organizationId: org.id, templateId: { in: [templateA.id, templateB.id] }, status: "ACTIVE" },
    });
    expect(installations).toHaveLength(2);
  });

  it("skips templates already installed and reports them as skipped", async () => {
    authMock.mockResolvedValue(fakeSession({ id: owner.id, role: "OWNER", organizationId: org.id }));
    const result = await installTemplatePackage(pkg.id);
    expect(result.installedCount).toBe(0);
    expect(result.skippedCount).toBe(2);
  });

  it("blocks package install when the org's AUTOMATIONS module isn't enabled", async () => {
    const noModuleOrg = await createTestOrg("Package No Module Org");
    await prisma.organizationModule.update({
      where: { organizationId_module: { organizationId: noModuleOrg.id, module: "AUTOMATIONS" } },
      data: { status: "CANCELLED" },
    });
    const noModuleOwner = await createTestUser(noModuleOrg.id, "OWNER", "package-no-module-owner");
    authMock.mockResolvedValue(fakeSession({ id: noModuleOwner.id, role: "OWNER", organizationId: noModuleOrg.id }));

    await expect(installTemplatePackage(pkg.id)).rejects.toThrow(/módulo/i);

    await cleanupOrg(noModuleOrg.id);
  });

  it("stops gracefully once the org's plan capacity for automations is reached, reporting a partial install", async () => {
    const limitedOrg = await createTestOrg("Package Plan Limit Org");
    await prisma.organization.update({ where: { id: limitedOrg.id }, data: { plan: "starter" } });
    const limitedOwner = await createTestUser(limitedOrg.id, "OWNER", "package-limited-owner");
    authMock.mockResolvedValue(fakeSession({ id: limitedOwner.id, role: "OWNER", organizationId: limitedOrg.id }));

    // Starter plan caps automations at 3 — pre-fill 2 so exactly 1 of the
    // package's 2 templates fits before the limit is hit.
    await prisma.automation.createMany({
      data: Array.from({ length: 2 }, (_, i) => ({
        organizationId: limitedOrg.id,
        name: `Existing ${i}`,
        type: "custom",
        webhookSecret: generateWebhookSecret(),
      })),
    });

    const result = await installTemplatePackage(pkg.id);
    expect(result.installedCount).toBe(1);
    expect(result.limitReached).toBe(true);

    await cleanupOrg(limitedOrg.id);
  });
});
