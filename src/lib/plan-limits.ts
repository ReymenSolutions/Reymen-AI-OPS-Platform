import { prisma } from "./prisma";
import { PLAN_LIMITS } from "./permissions";

type PlanResource = "leads" | "users" | "automations";

const RESOURCE_LABEL: Record<PlanResource, string> = {
  leads: "leads",
  users: "usuarios",
  automations: "automatizaciones",
};

async function countResource(organizationId: string, resource: PlanResource): Promise<number> {
  switch (resource) {
    case "leads":
      return prisma.lead.count({ where: { organizationId, deletedAt: null } });
    case "users":
      return prisma.user.count({ where: { organizationId, isActive: true } });
    case "automations":
      return prisma.automation.count({ where: { organizationId, status: { not: "ARCHIVED" } } });
  }
}

/** Throws a clear, upgrade-prompting error once the org is at or over its plan's cap for that resource. */
export async function assertPlanCapacity(organizationId: string, resource: PlanResource): Promise<void> {
  const org = await prisma.organization.findUniqueOrThrow({
    where: { id: organizationId },
    select: { plan: true },
  });
  const limit = (PLAN_LIMITS[org.plan] ?? PLAN_LIMITS.starter)[resource];
  const currentCount = await countResource(organizationId, resource);

  if (currentCount >= limit) {
    throw new Error(
      `Alcanzaste el límite de ${RESOURCE_LABEL[resource]} de tu plan (${limit}). Solicita más capacidad en Configuración.`
    );
  }
}
