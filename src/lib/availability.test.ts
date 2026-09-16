// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestOrg, cleanupOrg } from "@/test/helpers";
import { toLocalDayAndMinute, isWithinAvailability } from "./availability";

describe("toLocalDayAndMinute", () => {
  it("converts a UTC instant to the correct weekday and minute in a non-UTC timezone", () => {
    // 2024-01-08 is a Monday. 06:30 UTC = 00:30 local in America/Mexico_City (UTC-6).
    const date = new Date("2024-01-08T06:30:00Z");
    const result = toLocalDayAndMinute(date, "America/Mexico_City");
    expect(result).toEqual({ dayOfWeek: 1, minuteOfDay: 30 });
  });

  it("rolls over to the previous local day when the UTC time is early morning", () => {
    // 2024-01-08T02:00:00Z is still 2024-01-07 20:00 in America/Mexico_City (Sunday).
    const date = new Date("2024-01-08T02:00:00Z");
    const result = toLocalDayAndMinute(date, "America/Mexico_City");
    expect(result.dayOfWeek).toBe(0);
    expect(result.minuteOfDay).toBe(20 * 60);
  });
});

describe("isWithinAvailability", () => {
  let org: { id: string };

  beforeAll(async () => {
    org = await createTestOrg("Availability Lib Test Org");
  });

  afterAll(async () => {
    await cleanupOrg(org.id);
  });

  it("allows any slot when no rules are configured (backward compatible default)", async () => {
    const start = new Date("2024-01-08T06:00:00Z");
    const end = new Date("2024-01-08T07:00:00Z");
    const allowed = await isWithinAvailability(org.id, "America/Mexico_City", start, end);
    expect(allowed).toBe(true);
  });

  it("allows a slot fully inside a configured window", async () => {
    await prisma.availabilityRule.create({ data: { organizationId: org.id, dayOfWeek: 1, startMinute: 0, endMinute: 8 * 60 } });
    // Monday 00:30-01:30 local (America/Mexico_City) — inside 00:00-08:00.
    const start = new Date("2024-01-08T06:30:00Z");
    const end = new Date("2024-01-08T07:30:00Z");
    const allowed = await isWithinAvailability(org.id, "America/Mexico_City", start, end);
    expect(allowed).toBe(true);
    await prisma.availabilityRule.deleteMany({ where: { organizationId: org.id } });
  });

  it("rejects a slot outside every configured window", async () => {
    await prisma.availabilityRule.create({ data: { organizationId: org.id, dayOfWeek: 1, startMinute: 9 * 60, endMinute: 12 * 60 } });
    // Monday 00:30 local — outside 09:00-12:00.
    const start = new Date("2024-01-08T06:30:00Z");
    const end = new Date("2024-01-08T07:00:00Z");
    const allowed = await isWithinAvailability(org.id, "America/Mexico_City", start, end);
    expect(allowed).toBe(false);
    await prisma.availabilityRule.deleteMany({ where: { organizationId: org.id } });
  });

  it("rejects a slot that crosses local midnight", async () => {
    await prisma.availabilityRule.create({ data: { organizationId: org.id, dayOfWeek: 1, startMinute: 0, endMinute: 24 * 60 } });
    await prisma.availabilityRule.create({ data: { organizationId: org.id, dayOfWeek: 2, startMinute: 0, endMinute: 24 * 60 } });
    // 23:30 Monday to 00:30 Tuesday local time.
    const start = new Date("2024-01-09T05:30:00Z");
    const end = new Date("2024-01-09T06:30:00Z");
    const allowed = await isWithinAvailability(org.id, "America/Mexico_City", start, end);
    expect(allowed).toBe(false);
    await prisma.availabilityRule.deleteMany({ where: { organizationId: org.id } });
  });
});
