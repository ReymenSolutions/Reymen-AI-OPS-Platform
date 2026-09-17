import { prisma } from "./prisma";
import { getEnabledModules } from "./modules";
import type { PlatformModule } from "@prisma/client";

export interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  href: string;
  ctaLabel: string;
  completed: boolean;
}

export interface OnboardingStatus {
  steps: OnboardingStep[];
  completedCount: number;
  totalCount: number;
  allDone: boolean;
  onboardingCompletedAt: Date | null;
}

/**
 * Builds the setup checklist from real data — never a hardcoded slideshow.
 * Only steps for modules the org actually has enabled are included (a step
 * that links to a page the org can't reach would be a dead end), same
 * gating principle as PortalSidebar (§16) and the admin operations center
 * (Fase 8). If every applicable step is already done and the org hasn't
 * been marked complete yet, this marks it — so a client who happened to do
 * everything before ever opening this page doesn't keep seeing the nudge.
 */
export async function getOnboardingStatus(organizationId: string): Promise<OnboardingStatus> {
  const [org, enabledModules, userCount, leadCount, automationCount, whatsappAssistant] = await Promise.all([
    prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
      select: { onboardingCompletedAt: true },
    }),
    getEnabledModules(organizationId),
    prisma.user.count({ where: { organizationId, isActive: true } }),
    prisma.lead.count({ where: { organizationId, deletedAt: null } }),
    prisma.automation.count({ where: { organizationId, status: { not: "ARCHIVED" } } }),
    prisma.whatsAppAssistant.findUnique({ where: { organizationId }, select: { isActive: true } }),
  ]);

  const hasModule = (m: PlatformModule) => enabledModules.includes(m);
  const steps: OnboardingStep[] = [];

  if (hasModule("AI_WHATSAPP")) {
    steps.push({
      id: "whatsapp_assistant",
      title: "Configura tu Asistente de WhatsApp",
      description: "Define el saludo y la personalidad del asistente que atenderá a tus clientes por WhatsApp.",
      href: "/portal/whatsapp",
      ctaLabel: "Configurar asistente",
      completed: whatsappAssistant?.isActive === true,
    });
  }

  if (hasModule("CRM")) {
    steps.push({
      id: "first_lead",
      title: "Agrega tu primer lead",
      description: "Registra manualmente un prospecto, o deja que tus automatizaciones los capturen por ti.",
      href: "/portal/leads",
      ctaLabel: "Ir a Leads",
      completed: leadCount > 0,
    });
  }

  if (hasModule("AUTOMATIONS")) {
    steps.push({
      id: "first_automation",
      title: "Instala tu primera automatización",
      description: "Elige un template del marketplace para activar tu primer flujo automatizado.",
      href: "/portal/templates",
      ctaLabel: "Ver templates",
      completed: automationCount > 0,
    });
  }

  // Not gated by any module — every organization can invite teammates.
  steps.push({
    id: "invite_team",
    title: "Invita a tu equipo",
    description: "Agrega managers y agentes para que gestionen leads, conversaciones y citas contigo.",
    href: "/portal/settings",
    ctaLabel: "Gestionar equipo",
    completed: userCount > 1,
  });

  const completedCount = steps.filter((s) => s.completed).length;
  const allDone = steps.length > 0 && completedCount === steps.length;

  let onboardingCompletedAt = org.onboardingCompletedAt;
  if (allDone && !onboardingCompletedAt) {
    const updated = await prisma.organization.update({
      where: { id: organizationId },
      data: { onboardingCompletedAt: new Date() },
      select: { onboardingCompletedAt: true },
    });
    onboardingCompletedAt = updated.onboardingCompletedAt;
  }

  return { steps, completedCount, totalCount: steps.length, allDone, onboardingCompletedAt };
}
