// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestOrg, createTestUser, fakeSession, cleanupOrg } from "@/test/helpers";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const authMock = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => authMock() }));

const { createPrompt, updatePrompt, listPromptVersions, rollbackPromptVersion } = await import("./prompts");

describe("prompts actions — mass assignment protection", () => {
  let orgA: { id: string };
  let orgB: { id: string };
  let owner: { id: string };

  beforeAll(async () => {
    orgA = await createTestOrg("Prompts Org A");
    orgB = await createTestOrg("Prompts Org B");
    owner = await createTestUser(orgA.id, "OWNER", "prompts-owner");
  });

  afterAll(async () => {
    await cleanupOrg(orgA.id);
    await cleanupOrg(orgB.id);
  });

  it("CRITICAL: updatePrompt ignores a forged organizationId in the payload, keeping the record in the caller's org", async () => {
    authMock.mockResolvedValue(fakeSession({ id: owner.id, role: "OWNER", organizationId: orgA.id }));

    await createPrompt({ name: "My Prompt", content: "Some prompt content here", type: "FAQ" });
    const prompt = await prisma.prompt.findFirstOrThrow({ where: { organizationId: orgA.id, name: "My Prompt" } });

    // Forged payload with extra fields not exposed by the UI/schema.
    const forgedPayload = {
      name: "Still Mine",
      content: "Updated content long enough",
      type: "FAQ",
      organizationId: orgB.id,
      isActive: true,
    } as unknown as Parameters<typeof updatePrompt>[1];

    await updatePrompt(prompt.id, forgedPayload);

    const updated = await prisma.prompt.findUniqueOrThrow({ where: { id: prompt.id } });
    expect(updated.organizationId).toBe(orgA.id);
    expect(updated.isActive).toBe(false); // untouched — not part of the validated schema
    expect(updated.name).toBe("Still Mine"); // legitimate field still updates
  });

  it("rejects invalid data via runtime validation (not just TypeScript types)", async () => {
    authMock.mockResolvedValue(fakeSession({ id: owner.id, role: "OWNER", organizationId: orgA.id }));
    await expect(
      createPrompt({ name: "", content: "short", type: "FAQ" } as unknown as Parameters<typeof createPrompt>[0])
    ).rejects.toThrow();
  });
});

describe("prompts actions — versioning (Fase 7)", () => {
  let org: { id: string };
  let owner: { id: string };

  beforeAll(async () => {
    org = await createTestOrg("Prompts Versioning Org");
    owner = await createTestUser(org.id, "OWNER", "prompts-version-owner");
  });

  afterAll(async () => {
    await cleanupOrg(org.id);
  });

  it("createPrompt snapshots a version 1", async () => {
    authMock.mockResolvedValue(fakeSession({ id: owner.id, role: "OWNER", organizationId: org.id }));

    await createPrompt({ name: "Escalación base", content: "Contenido inicial del prompt de escalación", type: "ESCALATION" });
    const prompt = await prisma.prompt.findFirstOrThrow({ where: { organizationId: org.id, name: "Escalación base" } });

    const versions = await listPromptVersions(prompt.id);
    expect(versions).toHaveLength(1);
    expect(versions[0]).toMatchObject({ version: 1, isLatest: true, content: "Contenido inicial del prompt de escalación" });
  });

  it("updatePrompt with new content appends a new version and demotes the previous one", async () => {
    authMock.mockResolvedValue(fakeSession({ id: owner.id, role: "OWNER", organizationId: org.id }));

    await createPrompt({ name: "FAQ base", content: "Contenido inicial de preguntas frecuentes", type: "FAQ" });
    const prompt = await prisma.prompt.findFirstOrThrow({ where: { organizationId: org.id, name: "FAQ base" } });

    await updatePrompt(prompt.id, { content: "Contenido revisado de preguntas frecuentes" });

    const versions = await listPromptVersions(prompt.id);
    expect(versions).toHaveLength(2);
    expect(versions[0]).toMatchObject({ version: 2, isLatest: true, content: "Contenido revisado de preguntas frecuentes" });
    expect(versions[1]).toMatchObject({ version: 1, isLatest: false });

    const updated = await prisma.prompt.findUniqueOrThrow({ where: { id: prompt.id } });
    expect(updated.content).toBe("Contenido revisado de preguntas frecuentes");
  });

  it("updatePrompt with only a name change does not create a new version", async () => {
    authMock.mockResolvedValue(fakeSession({ id: owner.id, role: "OWNER", organizationId: org.id }));

    await createPrompt({ name: "Greeting base", content: "Contenido inicial de saludo", type: "GREETING" });
    const prompt = await prisma.prompt.findFirstOrThrow({ where: { organizationId: org.id, name: "Greeting base" } });

    await updatePrompt(prompt.id, { name: "Greeting renombrado" });

    const versions = await listPromptVersions(prompt.id);
    expect(versions).toHaveLength(1);
  });

  it("rollbackPromptVersion never deletes history — it appends a new version copying the old content", async () => {
    authMock.mockResolvedValue(fakeSession({ id: owner.id, role: "OWNER", organizationId: org.id }));

    await createPrompt({ name: "Rollback target", content: "Versión uno del contenido", type: "SYSTEM" });
    const prompt = await prisma.prompt.findFirstOrThrow({ where: { organizationId: org.id, name: "Rollback target" } });
    await updatePrompt(prompt.id, { content: "Versión dos del contenido" });

    const beforeRollback = await listPromptVersions(prompt.id);
    const v1 = beforeRollback.find((v) => v.version === 1)!;

    await rollbackPromptVersion(prompt.id, v1.id);

    const afterRollback = await listPromptVersions(prompt.id);
    expect(afterRollback).toHaveLength(3); // nothing was deleted, only appended
    expect(afterRollback[0]).toMatchObject({ version: 3, isLatest: true, content: "Versión uno del contenido" });

    const updated = await prisma.prompt.findUniqueOrThrow({ where: { id: prompt.id } });
    expect(updated.content).toBe("Versión uno del contenido");
  });

  it("rejects reading/rolling back a prompt version belonging to another organization", async () => {
    const otherOrg = await createTestOrg("Prompts Versioning Other Org");
    const otherOwner = await createTestUser(otherOrg.id, "OWNER", "prompts-version-other-owner");

    authMock.mockResolvedValue(fakeSession({ id: otherOwner.id, role: "OWNER", organizationId: otherOrg.id }));
    await createPrompt({ name: "Otro prompt", content: "Contenido de otra organización", type: "SYSTEM" });
    const otherPrompt = await prisma.prompt.findFirstOrThrow({ where: { organizationId: otherOrg.id, name: "Otro prompt" } });

    authMock.mockResolvedValue(fakeSession({ id: owner.id, role: "OWNER", organizationId: org.id }));
    await expect(listPromptVersions(otherPrompt.id)).rejects.toThrow(/no encontrado/i);

    await cleanupOrg(otherOrg.id);
  });
});
