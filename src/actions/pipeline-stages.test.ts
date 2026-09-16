// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestOrg, createTestUser, fakeSession, cleanupOrg } from "@/test/helpers";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const authMock = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => authMock() }));

const { createPipelineStage, updatePipelineStage, swapPipelineStageOrder, deletePipelineStage } = await import("./pipeline-stages");

describe("pipeline-stages actions", () => {
  let org: { id: string };
  let owner: { id: string };
  let agent: { id: string };

  beforeAll(async () => {
    org = await createTestOrg("Pipeline Stages Test Org");
    owner = await createTestUser(org.id, "OWNER", "pipeline-owner");
    agent = await createTestUser(org.id, "AGENT", "pipeline-agent");
  });

  afterAll(async () => {
    await cleanupOrg(org.id);
  });

  it("rejects a role without pipeline:manage", async () => {
    authMock.mockResolvedValue(fakeSession({ id: agent.id, role: "AGENT", organizationId: org.id }));
    await expect(createPipelineStage({ name: "Should Fail" })).rejects.toThrow();
  });

  it("creates a stage, appending it after the current max order", async () => {
    authMock.mockResolvedValue(fakeSession({ id: owner.id, role: "OWNER", organizationId: org.id }));
    const first = await createPipelineStage({ name: "First" });
    const second = await createPipelineStage({ name: "Second" });

    const [a, b] = await Promise.all([
      prisma.pipelineStage.findUniqueOrThrow({ where: { id: first.stageId } }),
      prisma.pipelineStage.findUniqueOrThrow({ where: { id: second.stageId } }),
    ]);
    expect(b.order).toBe(a.order + 1);
  });

  it("renames a stage", async () => {
    authMock.mockResolvedValue(fakeSession({ id: owner.id, role: "OWNER", organizationId: org.id }));
    const { stageId } = await createPipelineStage({ name: "Old Name" });
    await updatePipelineStage({ stageId, name: "New Name" });
    const stage = await prisma.pipelineStage.findUniqueOrThrow({ where: { id: stageId } });
    expect(stage.name).toBe("New Name");
  });

  it("swaps the order of two stages", async () => {
    authMock.mockResolvedValue(fakeSession({ id: owner.id, role: "OWNER", organizationId: org.id }));
    const a = await createPipelineStage({ name: "Swap A" });
    const b = await createPipelineStage({ name: "Swap B" });
    const [before1, before2] = await Promise.all([
      prisma.pipelineStage.findUniqueOrThrow({ where: { id: a.stageId } }),
      prisma.pipelineStage.findUniqueOrThrow({ where: { id: b.stageId } }),
    ]);

    await swapPipelineStageOrder(a.stageId, b.stageId);

    const [after1, after2] = await Promise.all([
      prisma.pipelineStage.findUniqueOrThrow({ where: { id: a.stageId } }),
      prisma.pipelineStage.findUniqueOrThrow({ where: { id: b.stageId } }),
    ]);
    expect(after1.order).toBe(before2.order);
    expect(after2.order).toBe(before1.order);
  });

  it("refuses to delete a stage that has active opportunities", async () => {
    authMock.mockResolvedValue(fakeSession({ id: owner.id, role: "OWNER", organizationId: org.id }));
    const { stageId } = await createPipelineStage({ name: "Occupied Stage" });
    const lead = await prisma.lead.create({ data: { organizationId: org.id, name: "Occupant" } });
    await prisma.opportunity.create({ data: { organizationId: org.id, leadId: lead.id, pipelineStageId: stageId, title: "Blocks deletion" } });

    await expect(deletePipelineStage(stageId)).rejects.toThrow(/no se puede eliminar/i);

    const stillThere = await prisma.pipelineStage.findUnique({ where: { id: stageId } });
    expect(stillThere).not.toBeNull();
  });

  it("deletes an empty stage", async () => {
    authMock.mockResolvedValue(fakeSession({ id: owner.id, role: "OWNER", organizationId: org.id }));
    const { stageId } = await createPipelineStage({ name: "Empty Stage" });
    await deletePipelineStage(stageId);
    const stillThere = await prisma.pipelineStage.findUnique({ where: { id: stageId } });
    expect(stillThere).toBeNull();
  });

  it("enforces tenant isolation: org B cannot manage org A's stages", async () => {
    authMock.mockResolvedValue(fakeSession({ id: owner.id, role: "OWNER", organizationId: org.id }));
    const { stageId } = await createPipelineStage({ name: "Isolated Stage" });

    const orgB = await createTestOrg("Pipeline Stages Org B");
    const ownerB = await createTestUser(orgB.id, "OWNER", "pipeline-owner-b");
    authMock.mockResolvedValue(fakeSession({ id: ownerB.id, role: "OWNER", organizationId: orgB.id }));

    await expect(updatePipelineStage({ stageId, name: "Hijacked" })).rejects.toThrow();
    await expect(deletePipelineStage(stageId)).rejects.toThrow();

    await cleanupOrg(orgB.id);
  });
});
