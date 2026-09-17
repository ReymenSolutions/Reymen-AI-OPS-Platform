"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { assertModuleEnabled } from "@/lib/modules";
import type { UserRole } from "@prisma/client";

async function requireSettingsManage() {
  const session = await auth();
  if (!session?.user.organizationId) throw new Error("No autorizado");
  if (!can(session.user.role as UserRole, "settings:manage")) throw new Error("No autorizado");
  await assertModuleEnabled(session.user.organizationId, "CRM");
  return session;
}

const ruleSchema = z.object({
  name: z.string().min(1),
  triggerStatus: z.enum(["NEW", "CONTACTED", "QUALIFIED", "PROPOSAL", "WON", "LOST"]),
  delayMinutes: z.number().int().min(5).max(90 * 24 * 60),
  repeatIntervalMinutes: z.number().int().min(5).max(90 * 24 * 60).nullable().optional(),
  maxAttempts: z.number().int().min(1).max(20).default(1),
  channel: z.string().min(1).default("whatsapp"),
  template: z.string().min(1),
  isActive: z.boolean().default(true),
});

/** Replaces the organization's entire follow-up rule set in one call — same rationale as setAvailabilityRules/setReminderRules: a short, fully-owned settings list. */
export async function setFollowUpRules(rules: z.input<typeof ruleSchema>[]) {
  const session = await requireSettingsManage();
  const parsed = z.array(ruleSchema).parse(rules);
  const orgId = session.user.organizationId!;

  await prisma.$transaction([
    prisma.followUpRule.deleteMany({ where: { organizationId: orgId } }),
    ...(parsed.length > 0
      ? [prisma.followUpRule.createMany({ data: parsed.map((r) => ({ organizationId: orgId, ...r })) })]
      : []),
  ]);

  revalidatePath("/portal/leads/settings");
  return { success: true };
}
