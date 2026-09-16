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
  offsetMinutes: z.number().int().min(5).max(30 * 24 * 60),
  channel: z.string().min(1).default("whatsapp"),
  template: z.string().min(1),
  isActive: z.boolean().default(true),
});

/** Replaces the organization's entire reminder rule set in one call — same rationale as setAvailabilityRules: a short, fully-owned settings list. */
export async function setReminderRules(rules: z.infer<typeof ruleSchema>[]) {
  const session = await requireSettingsManage();
  const parsed = z.array(ruleSchema).parse(rules);
  const orgId = session.user.organizationId!;

  await prisma.$transaction([
    prisma.appointmentReminderRule.deleteMany({ where: { organizationId: orgId } }),
    ...(parsed.length > 0
      ? [prisma.appointmentReminderRule.createMany({ data: parsed.map((r) => ({ organizationId: orgId, ...r })) })]
      : []),
  ]);

  revalidatePath("/portal/appointments/settings");
  return { success: true };
}
