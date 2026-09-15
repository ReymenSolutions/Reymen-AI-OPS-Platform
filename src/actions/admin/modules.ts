"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth, isAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import type { ModuleSource, ModuleStatus, PlatformModule } from "@prisma/client";

const setModuleSchema = z.object({
  orgId: z.string(),
  module: z.enum(["CRM", "AI_WHATSAPP", "AUTOMATIONS", "NFC_QR", "MARKETING_ADS"]),
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

export interface ModuleEntitlementView {
  module: PlatformModule;
  status: ModuleStatus | null;
  source: ModuleSource | null;
  updatedAt: Date | null;
  notes: string | null;
}

const ALL_MODULES: PlatformModule[] = ["CRM", "AI_WHATSAPP", "AUTOMATIONS", "NFC_QR", "MARKETING_ADS"];

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
