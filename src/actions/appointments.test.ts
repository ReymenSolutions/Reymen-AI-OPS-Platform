// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestOrg, createTestUser, fakeSession, cleanupOrg } from "@/test/helpers";
import { toLocalDayAndMinute } from "@/lib/availability";
import { monthPeriod, METRIC_KEYS } from "@/lib/metrics";

/** Finds the next UTC instant whose America/Mexico_City local time is `localHour`:00 on the given local weekday. */
function nextLocalDateTime(dayOfWeek: number, localHour: number): Date {
  const candidate = new Date(Date.now() + 24 * 60 * 60 * 1000);
  candidate.setUTCHours(localHour + 6, 0, 0, 0); // America/Mexico_City is UTC-6 year-round
  for (let i = 0; i < 8; i++) {
    if (toLocalDayAndMinute(candidate, "America/Mexico_City").dayOfWeek === dayOfWeek) return candidate;
    candidate.setUTCDate(candidate.getUTCDate() + 1);
  }
  throw new Error("Could not find matching local weekday");
}

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const authMock = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => authMock() }));

const { createAppointment, updateAppointmentStatus, rescheduleAppointment } = await import("./appointments");

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

    const metric = await prisma.metric.findUnique({
      where: { organizationId_key_period: { organizationId: org.id, key: METRIC_KEYS.APPOINTMENTS_BOOKED, period: monthPeriod() } },
    });
    expect(metric?.value).toBeGreaterThanOrEqual(1);
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

  describe("service-aware booking", () => {
    it("auto-fills the end time from the service's duration when endTime is omitted", async () => {
      authMock.mockResolvedValue(fakeSession({ id: owner.id, role: "OWNER", organizationId: org.id }));
      const service = await prisma.service.create({ data: { organizationId: org.id, name: "Corte", durationMinutes: 40 } });
      const start = new Date(Date.now() + 400 * 60 * 60 * 1000);

      await createAppointment({ title: "Con servicio", startTime: start.toISOString(), serviceId: service.id });

      const apt = await prisma.appointment.findFirstOrThrow({ where: { organizationId: org.id, title: "Con servicio" } });
      expect(apt.endTime.getTime() - apt.startTime.getTime()).toBe(40 * 60 * 1000);
      expect(apt.serviceId).toBe(service.id);
    });

    it("rejects when neither endTime nor serviceId is provided", async () => {
      authMock.mockResolvedValue(fakeSession({ id: owner.id, role: "OWNER", organizationId: org.id }));
      const start = new Date(Date.now() + 410 * 60 * 60 * 1000);
      await expect(createAppointment({ title: "Sin nada", startTime: start.toISOString() })).rejects.toThrow(/hora de fin|servicio/i);
    });

    it("CRITICAL: enforces the service's buffer minutes against the next booking", async () => {
      authMock.mockResolvedValue(fakeSession({ id: owner.id, role: "OWNER", organizationId: org.id }));
      const service = await prisma.service.create({ data: { organizationId: org.id, name: "Con buffer", durationMinutes: 30, bufferMinutes: 15 } });
      const start = new Date(Date.now() + 420 * 60 * 60 * 1000);
      const end = new Date(start.getTime() + 30 * 60 * 1000);

      await createAppointment({ title: "Primera con buffer", startTime: start.toISOString(), serviceId: service.id });

      // Starts exactly when the first appointment ends — normally allowed, but
      // the 15-minute buffer after it should still block this.
      const nextStart = end;
      const nextEnd = new Date(nextStart.getTime() + 30 * 60 * 1000);
      await expect(
        createAppointment({ title: "Choca con el buffer", startTime: nextStart.toISOString(), endTime: nextEnd.toISOString() })
      ).rejects.toThrow(/ocupado/);

      // Starting after the buffer window succeeds.
      const okStart = new Date(end.getTime() + 15 * 60 * 1000);
      const okEnd = new Date(okStart.getTime() + 30 * 60 * 1000);
      const result = await createAppointment({ title: "Después del buffer", startTime: okStart.toISOString(), endTime: okEnd.toISOString() });
      expect(result.success).toBe(true);
    });
  });

  describe("availability rules", () => {
    it("rejects a booking outside the organization's configured hours", async () => {
      authMock.mockResolvedValue(fakeSession({ id: owner.id, role: "OWNER", organizationId: org.id }));
      await prisma.organization.update({ where: { id: org.id }, data: { timezone: "America/Mexico_City" } });
      // Only Monday 09:00-12:00 local is open.
      await prisma.availabilityRule.create({ data: { organizationId: org.id, dayOfWeek: 1, startMinute: 9 * 60, endMinute: 12 * 60 } });

      // Next local Monday at 20:00 — outside the 09:00-12:00 window.
      const start = nextLocalDateTime(1, 20);
      const end = new Date(start.getTime() + 30 * 60 * 1000);

      await expect(
        createAppointment({ title: "Fuera de horario", startTime: start.toISOString(), endTime: end.toISOString() })
      ).rejects.toThrow(/disponibilidad/);

      await prisma.availabilityRule.deleteMany({ where: { organizationId: org.id } });
    });

    it("allows a booking inside the organization's configured hours", async () => {
      authMock.mockResolvedValue(fakeSession({ id: owner.id, role: "OWNER", organizationId: org.id }));
      await prisma.availabilityRule.create({ data: { organizationId: org.id, dayOfWeek: 1, startMinute: 9 * 60, endMinute: 12 * 60 } });

      // Next local Monday at 10:00 — inside the 09:00-12:00 window.
      const start = nextLocalDateTime(1, 10);
      const end = new Date(start.getTime() + 30 * 60 * 1000);

      const result = await createAppointment({ title: "Dentro de horario", startTime: start.toISOString(), endTime: end.toISOString() });
      expect(result.success).toBe(true);

      await prisma.availabilityRule.deleteMany({ where: { organizationId: org.id } });
    });
  });

  describe("rescheduleAppointment", () => {
    it("moves an appointment to a new time, preserving its duration", async () => {
      authMock.mockResolvedValue(fakeSession({ id: owner.id, role: "OWNER", organizationId: org.id }));
      const start = new Date(Date.now() + 500 * 60 * 60 * 1000);
      const end = new Date(start.getTime() + 30 * 60 * 1000);
      await createAppointment({ title: "A reprogramar", startTime: start.toISOString(), endTime: end.toISOString() });
      const apt = await prisma.appointment.findFirstOrThrow({ where: { organizationId: org.id, title: "A reprogramar" } });

      const newStart = new Date(start.getTime() + 5 * 60 * 60 * 1000);
      await rescheduleAppointment({ appointmentId: apt.id, startTime: newStart.toISOString(), endTime: new Date(newStart.getTime() + 30 * 60 * 1000).toISOString() });

      const updated = await prisma.appointment.findUniqueOrThrow({ where: { id: apt.id } });
      expect(updated.startTime.getTime()).toBe(newStart.getTime());
    });

    it("rejects rescheduling into a slot already occupied by another appointment", async () => {
      authMock.mockResolvedValue(fakeSession({ id: owner.id, role: "OWNER", organizationId: org.id }));
      const start1 = new Date(Date.now() + 520 * 60 * 60 * 1000);
      const end1 = new Date(start1.getTime() + 30 * 60 * 1000);
      await createAppointment({ title: "Fija", startTime: start1.toISOString(), endTime: end1.toISOString() });

      const start2 = new Date(Date.now() + 530 * 60 * 60 * 1000);
      const end2 = new Date(start2.getTime() + 30 * 60 * 1000);
      await createAppointment({ title: "Movible", startTime: start2.toISOString(), endTime: end2.toISOString() });
      const movable = await prisma.appointment.findFirstOrThrow({ where: { organizationId: org.id, title: "Movible" } });

      await expect(
        rescheduleAppointment({ appointmentId: movable.id, startTime: start1.toISOString(), endTime: end1.toISOString() })
      ).rejects.toThrow(/ocupado/);
    });

    it("a reschedule does not conflict with its own original slot", async () => {
      authMock.mockResolvedValue(fakeSession({ id: owner.id, role: "OWNER", organizationId: org.id }));
      const start = new Date(Date.now() + 540 * 60 * 60 * 1000);
      const end = new Date(start.getTime() + 30 * 60 * 1000);
      await createAppointment({ title: "Reprogramar a sí misma", startTime: start.toISOString(), endTime: end.toISOString() });
      const apt = await prisma.appointment.findFirstOrThrow({ where: { organizationId: org.id, title: "Reprogramar a sí misma" } });

      // Small shift that still overlaps the original slot — must succeed since the appointment excludes itself.
      const shiftedStart = new Date(start.getTime() + 10 * 60 * 1000);
      const result = await rescheduleAppointment({
        appointmentId: apt.id,
        startTime: shiftedStart.toISOString(),
        endTime: new Date(shiftedStart.getTime() + 30 * 60 * 1000).toISOString(),
      });
      expect(result.success).toBe(true);
    });

    it("rejects rescheduling a CANCELLED appointment", async () => {
      authMock.mockResolvedValue(fakeSession({ id: owner.id, role: "OWNER", organizationId: org.id }));
      const start = new Date(Date.now() + 560 * 60 * 60 * 1000);
      const end = new Date(start.getTime() + 30 * 60 * 1000);
      await createAppointment({ title: "Se cancela", startTime: start.toISOString(), endTime: end.toISOString() });
      const apt = await prisma.appointment.findFirstOrThrow({ where: { organizationId: org.id, title: "Se cancela" } });
      await updateAppointmentStatus(apt.id, "CANCELLED");

      await expect(
        rescheduleAppointment({ appointmentId: apt.id, startTime: start.toISOString(), endTime: end.toISOString() })
      ).rejects.toThrow(/agendadas o confirmadas/);
    });

    it("enforces tenant isolation: org B cannot reschedule org A's appointment", async () => {
      authMock.mockResolvedValue(fakeSession({ id: owner.id, role: "OWNER", organizationId: org.id }));
      const start = new Date(Date.now() + 580 * 60 * 60 * 1000);
      const end = new Date(start.getTime() + 30 * 60 * 1000);
      await createAppointment({ title: "Aislada", startTime: start.toISOString(), endTime: end.toISOString() });
      const apt = await prisma.appointment.findFirstOrThrow({ where: { organizationId: org.id, title: "Aislada" } });

      const orgB = await createTestOrg("Appointments Reschedule Org B");
      const ownerB = await createTestUser(orgB.id, "OWNER", "appointments-reschedule-owner-b");
      authMock.mockResolvedValue(fakeSession({ id: ownerB.id, role: "OWNER", organizationId: orgB.id }));

      await expect(
        rescheduleAppointment({ appointmentId: apt.id, startTime: start.toISOString(), endTime: end.toISOString() })
      ).rejects.toThrow(/no encontrada/);

      await cleanupOrg(orgB.id);
    });
  });
});
