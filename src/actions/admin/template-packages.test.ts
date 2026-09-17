// @vitest-environment node
import { describe, it, expect, afterEach, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { fakeSession } from "@/test/helpers";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const authMock = vi.fn();
vi.mock("@/lib/auth", () => ({
  auth: () => authMock(),
  isAdmin: (role: string) => role === "SUPER_ADMIN" || role === "ADMIN",
}));

const { createTemplatePackage, updateTemplatePackageItems, publishTemplatePackage } = await import(
  "./template-packages"
);

describe("admin/template-packages actions", () => {
  const createdTemplateIds: string[] = [];
  const createdPackageIds: string[] = [];

  afterEach(async () => {
    while (createdPackageIds.length) {
      const id = createdPackageIds.pop()!;
      await prisma.templatePackageItem.deleteMany({ where: { packageId: id } });
      await prisma.templatePackage.delete({ where: { id } }).catch(() => {});
    }
    while (createdTemplateIds.length) {
      const id = createdTemplateIds.pop()!;
      await prisma.templateVersion.deleteMany({ where: { templateId: id } });
      await prisma.automationTemplate.delete({ where: { id } }).catch(() => {});
    }
  });

  async function makeTemplate(isPublished = true) {
    const t = await prisma.automationTemplate.create({
      data: {
        name: `Test Template ${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        description: "Test template", industry: "clinic", category: "lead_capture",
        isPublished,
        versions: { create: { version: "1.0.0", n8nWorkflowJson: {}, isLatest: true } },
      },
    });
    createdTemplateIds.push(t.id);
    return t;
  }

  it("denies createTemplatePackage to a non-admin session", async () => {
    authMock.mockResolvedValue(fakeSession({ id: "u1", role: "OWNER", organizationId: null }));
    await expect(
      createTemplatePackage({ name: "X", description: "Descripción larga", industry: "clinic", templateIds: ["fake"] })
    ).rejects.toThrow(/autorizado/i);
  });

  it("creates a package with its items", async () => {
    authMock.mockResolvedValue(fakeSession({ id: "admin1", role: "SUPER_ADMIN", organizationId: null }));
    const t1 = await makeTemplate();
    const t2 = await makeTemplate();

    const result = await createTemplatePackage({
      name: "Paquete Clínica", description: "Paquete de prueba completo", industry: "clinic",
      templateIds: [t1.id, t2.id],
    });
    expect(result.success).toBe(true);
    createdPackageIds.push(result.packageId);

    const items = await prisma.templatePackageItem.findMany({ where: { packageId: result.packageId } });
    expect(items).toHaveLength(2);
  });

  it("rejects creating a package that references a nonexistent template", async () => {
    authMock.mockResolvedValue(fakeSession({ id: "admin1", role: "SUPER_ADMIN", organizationId: null }));
    await expect(
      createTemplatePackage({ name: "Paquete Inválido", description: "Descripción larga válida", industry: "clinic", templateIds: ["nonexistent-id"] })
    ).rejects.toThrow(/no existen/i);
  });

  it("updateTemplatePackageItems replaces the full item set", async () => {
    authMock.mockResolvedValue(fakeSession({ id: "admin1", role: "SUPER_ADMIN", organizationId: null }));
    const t1 = await makeTemplate();
    const t2 = await makeTemplate();
    const t3 = await makeTemplate();

    const created = await createTemplatePackage({
      name: "Paquete Editable", description: "Paquete de prueba editable", industry: "clinic",
      templateIds: [t1.id, t2.id],
    });
    createdPackageIds.push(created.packageId);

    await updateTemplatePackageItems(created.packageId, { templateIds: [t3.id] });

    const items = await prisma.templatePackageItem.findMany({ where: { packageId: created.packageId } });
    expect(items).toHaveLength(1);
    expect(items[0].templateId).toBe(t3.id);
  });

  it("publishTemplatePackage requires at least one published template", async () => {
    authMock.mockResolvedValue(fakeSession({ id: "admin1", role: "SUPER_ADMIN", organizationId: null }));
    const unpublished = await makeTemplate(false);

    const created = await createTemplatePackage({
      name: "Paquete Sin Publicar", description: "Todos sus templates son borradores", industry: "clinic",
      templateIds: [unpublished.id],
    });
    createdPackageIds.push(created.packageId);

    await expect(publishTemplatePackage(created.packageId, true)).rejects.toThrow(/al menos un template publicado/i);
  });

  it("publishTemplatePackage publishes when at least one template is published", async () => {
    authMock.mockResolvedValue(fakeSession({ id: "admin1", role: "SUPER_ADMIN", organizationId: null }));
    const published = await makeTemplate(true);

    const created = await createTemplatePackage({
      name: "Paquete Publicable", description: "Tiene un template publicado", industry: "clinic",
      templateIds: [published.id],
    });
    createdPackageIds.push(created.packageId);

    const result = await publishTemplatePackage(created.packageId, true);
    expect(result.success).toBe(true);

    const pkg = await prisma.templatePackage.findUniqueOrThrow({ where: { id: created.packageId } });
    expect(pkg.isPublished).toBe(true);
  });
});
