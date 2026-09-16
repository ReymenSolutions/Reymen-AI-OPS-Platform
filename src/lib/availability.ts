import { prisma } from "./prisma";

/** Weekday index matching AvailabilityRule.dayOfWeek: 0 = Sunday .. 6 = Saturday. */
const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

/** Converts a UTC instant into its wall-clock day-of-week and minutes-since-midnight in the given IANA timezone, using only the platform's built-in Intl support (no date library dependency). */
export function toLocalDayAndMinute(date: Date, timezone: string): { dayOfWeek: number; minuteOfDay: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const weekday = parts.find((p) => p.type === "weekday")!.value;
  const hour = Number(parts.find((p) => p.type === "hour")!.value);
  const minute = Number(parts.find((p) => p.type === "minute")!.value);

  return { dayOfWeek: WEEKDAY_INDEX[weekday], minuteOfDay: hour * 60 + minute };
}

/**
 * Checks a requested [start, end) slot against the organization's configured
 * weekly availability, in its own timezone. An org with no active rules has
 * no restriction configured yet, so every slot is allowed — this keeps
 * existing behavior for organizations that haven't set up Agenda hours.
 * A slot that crosses local midnight is rejected outright rather than
 * matched against two different days' rules.
 */
export async function isWithinAvailability(organizationId: string, timezone: string, start: Date, end: Date): Promise<boolean> {
  const rules = await prisma.availabilityRule.findMany({
    where: { organizationId, isActive: true },
  });
  if (rules.length === 0) return true;

  const startLocal = toLocalDayAndMinute(start, timezone);
  const endLocal = toLocalDayAndMinute(end, timezone);

  if (startLocal.dayOfWeek !== endLocal.dayOfWeek || endLocal.minuteOfDay <= startLocal.minuteOfDay) {
    // Crosses midnight (or spans more than 24h) in local time.
    return false;
  }

  return rules.some(
    (rule) =>
      rule.dayOfWeek === startLocal.dayOfWeek &&
      rule.startMinute <= startLocal.minuteOfDay &&
      endLocal.minuteOfDay <= rule.endMinute
  );
}
