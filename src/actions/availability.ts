"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import type { UserRole } from "@prisma/client";

async function requireSettingsManage() {
  const session = await auth();
  if (!session?.user.organizationId) throw new Error("No autorizado");
  if (!can(session.user.role as UserRole, "settings:manage")) throw new Error("No autorizado");
  return session;
}

const ruleSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  startMinute: z.number().int().min(0).max(1440),
  endMinute: z.number().int().min(0).max(1440),
});

const setRulesSchema = z.array(ruleSchema).refine(
  (rules) => rules.every((r) => r.endMinute > r.startMinute),
  { message: "La hora de fin debe ser posterior a la de inicio en cada regla" }
);

/**
 * Replaces the organization's entire weekly availability grid in one call —
 * simpler and safer than per-row CRUD for a small, fully-owned settings UI
 * (a handful of rows, always saved as a whole grid).
 */
export async function setAvailabilityRules(rules: z.infer<typeof setRulesSchema>) {
  const session = await requireSettingsManage();
  const parsed = setRulesSchema.parse(rules);
  const orgId = session.user.organizationId!;

  await prisma.$transaction([
    prisma.availabilityRule.deleteMany({ where: { organizationId: orgId } }),
    ...(parsed.length > 0
      ? [
          prisma.availabilityRule.createMany({
            data: parsed.map((r) => ({ organizationId: orgId, ...r })),
          }),
        ]
      : []),
  ]);

  revalidatePath("/portal/appointments/settings");
  return { success: true };
}

export async function getAvailabilityRules(organizationId: string) {
  return prisma.availabilityRule.findMany({
    where: { organizationId, isActive: true },
    orderBy: [{ dayOfWeek: "asc" }, { startMinute: "asc" }],
  });
}

export async function setOrgTimezone(timezone: string) {
  const session = await requireSettingsManage();
  // Validate against the runtime's own IANA database rather than a hardcoded
  // list — throws for a bogus zone name.
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone });
  } catch {
    throw new Error("Zona horaria inválida");
  }

  await prisma.organization.update({ where: { id: session.user.organizationId! }, data: { timezone } });

  revalidatePath("/portal/appointments/settings");
  revalidatePath("/portal/settings");
  return { success: true };
}
