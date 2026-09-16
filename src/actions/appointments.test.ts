// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestOrg, createTestUser, fakeSession, cleanupOrg } from "@/test/helpers";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const authMock = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => authMock() }));

const { createAppointment, updateAppointmentStatus } = await import("./appointments");

describe("appointments actions", () => {
  let org: { id: string };
  let owner: { id: string };

  beforeAll(async () => {
    org = await createTestOrg("Appointments Test Org");
    owner = await createTestUser(org.id, "OWNER", "appointments-owner");
  });

  afterAll(async () => {
    await cleanupOrg(org.id);
  });

  it("creates an appointment with valid start/end times", async () => {
    authMock.mockResolvedValue(fakeSession({ id: owner.id, role: "OWNER", organizationId: org.id }));
    const start = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const end = new Date(start.getTime() + 30 * 60 * 1000);

    const result = await createAppointment({
      title: "Consulta inicial",
      startTime: start.toISOString(),
      endTime: end.toISOString(),
    });
    expect(result.success).toBe(true);
  });

  it("rejects an end time at or before the start time", async () => {
    authMock.mockResolvedValue(fakeSession({ id: owner.id, role: "OWNER", organizationId: org.id }));
    const start = new Date(Date.now() + 48 * 60 * 60 * 1000);

    await expect(
      createAppointment({ title: "Inválida", startTime: start.toISOString(), endTime: start.toISOString() })
    ).rejects.toThrow(/posterior/);
  });

  it("CRITICAL: rejects a second appointment that overlaps an existing SCHEDULED one", async () => {
    authMock.mockResolvedValue(fakeSession({ id: owner.id, role: "OWNER", organizationId: org.id }));
    const start = new Date(Date.now() + 72 * 60 * 60 * 1000);
    const end = new Date(start.getTime() + 60 * 60 * 1000);

    await createAppointment({ title: "Primera cita", startTime: start.toISOString(), endTime: end.toISOString() });

    // Overlaps the first by 30 minutes in the middle.
    const overlapStart = new Date(start.getTime() + 30 * 60 * 1000);
    const overlapEnd = new Date(overlapStart.getTime() + 60 * 60 * 1000);

    await expect(
      createAppointment({ title: "Choca con la primera", startTime: overlapStart.toISOString(), endTime: overlapEnd.toISOString() })
    ).rejects.toThrow(/ocupado/);

    const count = await prisma.appointment.count({
      where: { organizationId: org.id, title: { in: ["Primera cita", "Choca con la primera"] } },
    });
    expect(count).toBe(1);
  });

  it("allows a back-to-back appointment that starts exactly when the previous one ends", async () => {
    authMock.mockResolvedValue(fakeSession({ id: owner.id, role: "OWNER", organizationId: org.id }));
    const start = new Date(Date.now() + 96 * 60 * 60 * 1000);
    const end = new Date(start.getTime() + 30 * 60 * 1000);
    await createAppointment({ title: "Bloque 1", startTime: start.toISOString(), endTime: end.toISOString() });

    const nextStart = end; // starts exactly when the previous one ends — not an overlap
    const nextEnd = new Date(nextStart.getTime() + 30 * 60 * 1000);
    const result = await createAppointment({ title: "Bloque 2", startTime: nextStart.toISOString(), endTime: nextEnd.toISOString() });
    expect(result.success).toBe(true);
  });

  it("does not consider a CANCELLED appointment's slot occupied", async () => {
    authMock.mockResolvedValue(fakeSession({ id: owner.id, role: "OWNER", organizationId: org.id }));
    const start = new Date(Date.now() + 120 * 60 * 60 * 1000);
    const end = new Date(start.getTime() + 45 * 60 * 1000);

    await createAppointment({ title: "Se va a cancelar", startTime: start.toISOString(), endTime: end.toISOString() });
    const cancelled = await prisma.appointment.findFirstOrThrow({ where: { organizationId: org.id, title: "Se va a cancelar" } });
    await updateAppointmentStatus(cancelled.id, "CANCELLED");

    const result = await createAppointment({ title: "Reemplazo", startTime: start.toISOString(), endTime: end.toISOString() });
    expect(result.success).toBe(true);
  });

  it("CRITICAL: two concurrent requests for the exact same slot result in exactly one success and one rejection", async () => {
    authMock.mockResolvedValue(fakeSession({ id: owner.id, role: "OWNER", organizationId: org.id }));
    const start = new Date(Date.now() + 200 * 60 * 60 * 1000);
    const end = new Date(start.getTime() + 30 * 60 * 1000);

    const [a, b] = await Promise.allSettled([
      createAppointment({ title: "Carrera A", startTime: start.toISOString(), endTime: end.toISOString() }),
      createAppointment({ title: "Carrera B", startTime: start.toISOString(), endTime: end.toISOString() }),
    ]);

    const outcomes = [a.status, b.status];
    expect(outcomes.filter((s) => s === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((s) => s === "rejected")).toHaveLength(1);

    const count = await prisma.appointment.count({
      where: { organizationId: org.id, title: { in: ["Carrera A", "Carrera B"] } },
    });
    expect(count).toBe(1);
  });

  it("enforces tenant isolation: org B cannot update org A's appointment status", async () => {
    authMock.mockResolvedValue(fakeSession({ id: owner.id, role: "OWNER", organizationId: org.id }));
    const start = new Date(Date.now() + 300 * 60 * 60 * 1000);
    const end = new Date(start.getTime() + 30 * 60 * 1000);
    await createAppointment({ title: "Aislamiento", startTime: start.toISOString(), endTime: end.toISOString() });
    const apt = await prisma.appointment.findFirstOrThrow({ where: { organizationId: org.id, title: "Aislamiento" } });

    const orgB = await createTestOrg("Appointments Org B");
    const ownerB = await createTestUser(orgB.id, "OWNER", "appointments-owner-b");
    authMock.mockResolvedValue(fakeSession({ id: ownerB.id, role: "OWNER", organizationId: orgB.id }));

    await expect(updateAppointmentStatus(apt.id, "CONFIRMED")).rejects.toThrow();

    const stillThere = await prisma.appointment.findUniqueOrThrow({ where: { id: apt.id } });
    expect(stillThere.status).toBe("SCHEDULED");

    await cleanupOrg(orgB.id);
  });
});
