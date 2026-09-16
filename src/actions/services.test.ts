// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestOrg, createTestUser, fakeSession, cleanupOrg } from "@/test/helpers";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const authMock = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => authMock() }));

const { createService, updateService, deleteService } = await import("./services");

describe("services actions", () => {
  let org: { id: string };
  let owner: { id: string };
  let agent: { id: string };

  beforeAll(async () => {
    org = await createTestOrg("Services Test Org");
    owner = await createTestUser(org.id, "OWNER", "services-owner");
    agent = await createTestUser(org.id, "AGENT", "services-agent");
  });

  afterAll(async () => {
    await cleanupOrg(org.id);
  });

  it("rejects a role without settings:manage", async () => {
    authMock.mockResolvedValue(fakeSession({ id: agent.id, role: "AGENT", organizationId: org.id }));
    await expect(createService({ name: "Should fail", durationMinutes: 30 })).rejects.toThrow();
  });

  it("creates a service with defaults for optional fields", async () => {
    authMock.mockResolvedValue(fakeSession({ id: owner.id, role: "OWNER", organizationId: org.id }));
    const result = await createService({ name: "Consulta general", durationMinutes: 30 });
    expect(result.success).toBe(true);

    const service = await prisma.service.findUniqueOrThrow({ where: { id: result.serviceId } });
    expect(service.bufferMinutes).toBe(0);
    expect(service.isActive).toBe(true);
  });

  it("updates a service", async () => {
    authMock.mockResolvedValue(fakeSession({ id: owner.id, role: "OWNER", organizationId: org.id }));
    const { serviceId } = await createService({ name: "To Rename", durationMinutes: 45 });
    await updateService({ serviceId, name: "Renamed", isActive: false });

    const service = await prisma.service.findUniqueOrThrow({ where: { id: serviceId } });
    expect(service.name).toBe("Renamed");
    expect(service.isActive).toBe(false);
  });

  it("refuses to delete a service with associated appointments", async () => {
    authMock.mockResolvedValue(fakeSession({ id: owner.id, role: "OWNER", organizationId: org.id }));
    const { serviceId } = await createService({ name: "Occupied Service", durationMinutes: 30 });
    await prisma.appointment.create({
      data: { organizationId: org.id, serviceId, title: "Blocks deletion", startTime: new Date(), endTime: new Date(Date.now() + 30 * 60 * 1000) },
    });

    await expect(deleteService(serviceId)).rejects.toThrow(/no se puede eliminar/i);
  });

  it("deletes a service with no appointments", async () => {
    authMock.mockResolvedValue(fakeSession({ id: owner.id, role: "OWNER", organizationId: org.id }));
    const { serviceId } = await createService({ name: "Empty Service", durationMinutes: 30 });
    await deleteService(serviceId);
    const stillThere = await prisma.service.findUnique({ where: { id: serviceId } });
    expect(stillThere).toBeNull();
  });

  it("enforces tenant isolation: org B cannot manage org A's services", async () => {
    authMock.mockResolvedValue(fakeSession({ id: owner.id, role: "OWNER", organizationId: org.id }));
    const { serviceId } = await createService({ name: "Isolated Service", durationMinutes: 30 });

    const orgB = await createTestOrg("Services Org B");
    const ownerB = await createTestUser(orgB.id, "OWNER", "services-owner-b");
    authMock.mockResolvedValue(fakeSession({ id: ownerB.id, role: "OWNER", organizationId: orgB.id }));

    await expect(updateService({ serviceId, name: "Hijacked" })).rejects.toThrow();
    await expect(deleteService(serviceId)).rejects.toThrow();

    await cleanupOrg(orgB.id);
  });
});
