// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestOrg, cleanupOrg } from "@/test/helpers";
import { recordMetric, monthPeriod, METRIC_KEYS } from "./metrics";

describe("monthPeriod", () => {
  it("formats a date as a zero-padded YYYY-MM bucket", () => {
    expect(monthPeriod(new Date(Date.UTC(2026, 0, 15)))).toBe("2026-01");
    expect(monthPeriod(new Date(Date.UTC(2026, 10, 3)))).toBe("2026-11");
  });
});

describe("recordMetric", () => {
  let org: { id: string };

  beforeAll(async () => {
    org = await createTestOrg("Metrics Test Org");
  });

  afterAll(async () => {
    await cleanupOrg(org.id);
  });

  it("creates a new Metric row on the first call for an org/key/month", async () => {
    const at = new Date(Date.UTC(2026, 2, 1));
    await recordMetric(org.id, METRIC_KEYS.LEADS_CAPTURED, 1, at);

    const metric = await prisma.metric.findUnique({
      where: { organizationId_key_period: { organizationId: org.id, key: METRIC_KEYS.LEADS_CAPTURED, period: "2026-03" } },
    });
    expect(metric?.value).toBe(1);
  });

  it("accumulates on repeated calls within the same month instead of overwriting", async () => {
    const at = new Date(Date.UTC(2026, 3, 5));
    await recordMetric(org.id, METRIC_KEYS.MESSAGES_SENT, 1, at);
    await recordMetric(org.id, METRIC_KEYS.MESSAGES_SENT, 1, at);
    await recordMetric(org.id, METRIC_KEYS.MESSAGES_SENT, 3, at);

    const metric = await prisma.metric.findUnique({
      where: { organizationId_key_period: { organizationId: org.id, key: METRIC_KEYS.MESSAGES_SENT, period: "2026-04" } },
    });
    expect(metric?.value).toBe(5);
  });

  it("CRITICAL: concurrent increments for the same org/key/month all land — no lost updates from a read-then-write race", async () => {
    const at = new Date(Date.UTC(2026, 4, 10));
    await Promise.all(
      Array.from({ length: 10 }, () => recordMetric(org.id, METRIC_KEYS.AUTOMATION_EXECUTIONS, 1, at))
    );

    const metric = await prisma.metric.findUnique({
      where: { organizationId_key_period: { organizationId: org.id, key: METRIC_KEYS.AUTOMATION_EXECUTIONS, period: "2026-05" } },
    });
    expect(metric?.value).toBe(10);
  });

  it("keeps different months as separate rows rather than merging them", async () => {
    await recordMetric(org.id, METRIC_KEYS.APPOINTMENTS_BOOKED, 1, new Date(Date.UTC(2026, 5, 1)));
    await recordMetric(org.id, METRIC_KEYS.APPOINTMENTS_BOOKED, 1, new Date(Date.UTC(2026, 6, 1)));

    const rows = await prisma.metric.findMany({
      where: { organizationId: org.id, key: METRIC_KEYS.APPOINTMENTS_BOOKED },
      orderBy: { period: "asc" },
    });
    expect(rows.map((r) => ({ period: r.period, value: r.value }))).toEqual([
      { period: "2026-06", value: 1 },
      { period: "2026-07", value: 1 },
    ]);
  });

  it("keeps different organizations' counters for the same key/month independent", async () => {
    const otherOrg = await createTestOrg("Metrics Other Org");
    const at = new Date(Date.UTC(2026, 7, 1));

    await recordMetric(org.id, METRIC_KEYS.CONVERSATIONS_ESCALATED, 5, at);
    await recordMetric(otherOrg.id, METRIC_KEYS.CONVERSATIONS_ESCALATED, 2, at);

    const [mine, theirs] = await Promise.all([
      prisma.metric.findUnique({
        where: { organizationId_key_period: { organizationId: org.id, key: METRIC_KEYS.CONVERSATIONS_ESCALATED, period: "2026-08" } },
      }),
      prisma.metric.findUnique({
        where: { organizationId_key_period: { organizationId: otherOrg.id, key: METRIC_KEYS.CONVERSATIONS_ESCALATED, period: "2026-08" } },
      }),
    ]);
    expect(mine?.value).toBe(5);
    expect(theirs?.value).toBe(2);

    await cleanupOrg(otherOrg.id);
  });

  it("never throws even if the organization doesn't exist (fire-and-forget, like logAudit)", async () => {
    await expect(recordMetric("does-not-exist", METRIC_KEYS.LEADS_CAPTURED)).resolves.toBeUndefined();
  });
});
