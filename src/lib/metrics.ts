import { prisma } from "./prisma";

/**
 * Canonical Metric.key values written across the codebase — kept here so
 * every writer and every reader (the admin consumption panel) agree on the
 * exact string instead of each call site inventing its own.
 */
export const METRIC_KEYS = {
  LEADS_CAPTURED: "leads_captured",
  MESSAGES_SENT: "messages_sent",
  MESSAGES_RECEIVED: "messages_received",
  AUTOMATION_EXECUTIONS: "automation_executions",
  AUTOMATION_FAILURES: "automation_failures",
  APPOINTMENTS_BOOKED: "appointments_booked",
  CONVERSATIONS_ESCALATED: "conversations_escalated",
} as const;

export type MetricKey = (typeof METRIC_KEYS)[keyof typeof METRIC_KEYS];

/** "2026-09" — a calendar-month bucket, matching the billing cycle this data is meant to inform. */
export function monthPeriod(at: Date = new Date()): string {
  return `${at.getUTCFullYear()}-${String(at.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Increments a monthly usage counter for an organization. Fire-and-forget,
 * same principle as logAudit(): a metrics write must never break the real
 * operation it's counting (a lead getting created, a message getting sent).
 * Uses the Metric model's own (organizationId, key, period) unique
 * constraint as an atomic upsert — concurrent calls for the same org/key/
 * month accumulate correctly rather than racing on a read-then-write.
 */
export async function recordMetric(
  organizationId: string,
  key: MetricKey,
  incrementBy = 1,
  at: Date = new Date()
): Promise<void> {
  const period = monthPeriod(at);
  try {
    await prisma.metric.upsert({
      where: { organizationId_key_period: { organizationId, key, period } },
      create: { organizationId, key, period, value: incrementBy },
      update: { value: { increment: incrementBy } },
    });
  } catch {
    // Never let a metrics write fail the caller's real operation.
  }
}
