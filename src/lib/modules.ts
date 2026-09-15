import { redirect } from "next/navigation";
import { prisma } from "./prisma";
import type { PlatformModule } from "@prisma/client";

/**
 * Commercial module entitlements — distinct from RBAC (permissions.ts,
 * what a user may do) and from feature flags (gradual rollout of
 * experimental functionality within an already-enabled module). This
 * answers "does this organization's account have access to this line of
 * business at all."
 */
const MODULE_LABEL: Record<PlatformModule, string> = {
  CRM: "CRM",
  AI_WHATSAPP: "Asistente IA / WhatsApp",
  AUTOMATIONS: "Automatizaciones",
  NFC_QR: "Smart Cards NFC/QR",
  MARKETING_ADS: "Marketing / Ads",
};

export async function hasModule(organizationId: string, module: PlatformModule): Promise<boolean> {
  const entitlement = await prisma.organizationModule.findUnique({
    where: { organizationId_module: { organizationId, module } },
    select: { status: true },
  });
  return entitlement?.status === "ACTIVE";
}

/** For Server Actions: throws a clear, user-facing error if the module isn't enabled. */
export async function assertModuleEnabled(organizationId: string, module: PlatformModule): Promise<void> {
  if (!(await hasModule(organizationId, module))) {
    throw new Error(`Tu organización no tiene el módulo "${MODULE_LABEL[module]}" habilitado.`);
  }
}

/** For Server Component pages: redirects instead of throwing, since there's no toast to catch an error. */
export async function requireModule(organizationId: string, module: PlatformModule): Promise<void> {
  if (!(await hasModule(organizationId, module))) {
    redirect("/portal/dashboard");
  }
}

export async function getEnabledModules(organizationId: string): Promise<PlatformModule[]> {
  const rows = await prisma.organizationModule.findMany({
    where: { organizationId, status: "ACTIVE" },
    select: { module: true },
  });
  return rows.map((r) => r.module);
}
