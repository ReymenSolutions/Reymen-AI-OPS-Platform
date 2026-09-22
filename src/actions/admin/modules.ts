"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth, isAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { PLAN_MODULES } from "@/lib/permissions";
import type { ModuleSource, ModuleStatus, PlatformModule } from "@prisma/client";

const setModuleSchema = z.object({
  orgId: z.string(),
  module: z.enum(["CRM", "AI_WHATSAPP", "AUTOMATIONS", "NFC_QR", "MARKETING_ADS", "FOOD_OPS"]),
  status: z.enum(["ACTIVE", "SUSPENDED", "CANCELLED"]),
  source: z.enum(["SUBSCRIBED", "ADMIN_GRANTED"]),
  notes: z.string().optional(),
});

/** Grants, suspends, or cancels a single module for an organization. Upserts — a module with no row yet is treated as not-enabled by every guard, so this both creates a new entitlement and updates an existing one. */
export async function setOrganizationModule(
  data: z.infer<typeof setModuleSchema>
) {
  const session = await auth();
  if (!session || !isAdmin(session.user.role)) throw new Error("No autorizado");

  const { orgId, module, status, source, notes } = setModuleSchema.parse(data);

  const timestamps: { suspendedAt?: Date | null; cancelledAt?: Date | null } = {};
  if (status === "SUSPENDED") timestamps.suspendedAt = new Date();
  if (status === "CANCELLED") timestamps.cancelledAt = new Date();
  if (status === "ACTIVE") {
    timestamps.suspendedAt = null;
    timestamps.cancelledAt = null;
  }

  const entitlement = await prisma.organizationModule.upsert({
    where: { organizationId_module: { organizationId: orgId, module } },
    create: { organizationId: orgId, module, status, source, notes, ...timestamps },
    update: { status, source, notes, ...timestamps },
  });

  await logAudit({
    userId: session.user.id,
    organizationId: orgId,
    action: "client.module_change",
    resource: "OrganizationModule",
    resourceId: entitlement.id,
    metadata: { module, status, source },
  });

  revalidatePath(`/admin/clients/${orgId}`);
  return { success: true };
}

/**
 * Activates whichever modules the org's current plan (PLAN_MODULES) includes
 * that aren't already ACTIVE — additive only. Never suspends or cancels a
 * module the org already has, even one outside the plan's list (an
 * ADMIN_GRANTED courtesy module stays exactly as it is). This is the one
 * place ModuleSource.SUBSCRIBED actually gets tied to a plan; it's always an
 * explicit admin click here, never triggered by the Stripe webhook — a plan
 * change through Stripe (checkout or the billing portal) still only updates
 * Organization.plan, same as it always has.
 */
export async function syncModulesToPlan(orgId: string) {
  const session = await auth();
  if (!session || !isAdmin(session.user.role)) throw new Error("No autorizado");

  const org = await prisma.organization.findUniqueOrThrow({ where: { id: orgId }, select: { plan: true } });
  const planModules = PLAN_MODULES[org.plan] ?? PLAN_MODULES.starter;

  const existing = await prisma.organizationModule.findMany({
    where: { organizationId: orgId, module: { in: planModules } },
  });
  const activeSet = new Set(existing.filter((m) => m.status === "ACTIVE").map((m) => m.module));
  const toActivate = planModules.filter((m) => !activeSet.has(m));

  for (const platformModule of toActivate) {
    const entitlement = await prisma.organizationModule.upsert({
      where: { organizationId_module: { organizationId: orgId, module: platformModule } },
      create: { organizationId: orgId, module: platformModule, status: "ACTIVE", source: "SUBSCRIBED" },
      update: { status: "ACTIVE", source: "SUBSCRIBED", suspendedAt: null, cancelledAt: null },
    });
    await logAudit({
      userId: session.user.id,
      organizationId: orgId,
      action: "client.module_change",
      resource: "OrganizationModule",
      resourceId: entitlement.id,
      metadata: { module: platformModule, status: "ACTIVE", source: "SUBSCRIBED", reason: "plan_sync" },
    });
  }

  revalidatePath(`/admin/clients/${orgId}`);
  return { success: true, activatedModules: toActivate };
}

export interface ModuleEntitlementView {
  module: PlatformModule;
  status: ModuleStatus | null;
  source: ModuleSource | null;
  updatedAt: Date | null;
  notes: string | null;
}

const ALL_MODULES: PlatformModule[] = ["CRM", "AI_WHATSAPP", "AUTOMATIONS", "NFC_QR", "MARKETING_ADS", "FOOD_OPS"];

/** Every module's current state for an org, including ones with no row yet (shown as not-enabled). */
export async function getOrganizationModules(orgId: string): Promise<ModuleEntitlementView[]> {
  const rows = await prisma.organizationModule.findMany({ where: { organizationId: orgId } });
  const byModule = new Map(rows.map((r) => [r.module, r]));

  return ALL_MODULES.map((module) => {
    const row = byModule.get(module);
    return {
      module,
      status: row?.status ?? null,
      source: row?.source ?? null,
      updatedAt: row?.updatedAt ?? null,
      notes: row?.notes ?? null,
    };
  });
}
