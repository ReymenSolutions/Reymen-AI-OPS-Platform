import { prisma } from "./prisma";
import { getEnabledModules } from "./modules";
import { getServerLang } from "./i18n-server";
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
  const [org, enabledModules, userCount, leadCount, automationCount, whatsappAssistant, lang] = await Promise.all([
    prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
      select: { onboardingCompletedAt: true },
    }),
    getEnabledModules(organizationId),
    prisma.user.count({ where: { organizationId, isActive: true } }),
    prisma.lead.count({ where: { organizationId, deletedAt: null } }),
    prisma.automation.count({ where: { organizationId, status: { not: "ARCHIVED" } } }),
    prisma.whatsAppAssistant.findUnique({ where: { organizationId }, select: { isActive: true } }),
    getServerLang(),
  ]);

  const hasModule = (m: PlatformModule) => enabledModules.includes(m);
  const steps: OnboardingStep[] = [];
  const isEs = lang === "es";

  if (hasModule("AI_WHATSAPP")) {
    steps.push({
      id: "whatsapp_assistant",
      title: isEs ? "Configura tu Asistente de WhatsApp" : "Set up your WhatsApp Assistant",
      description: isEs
        ? "Define el saludo y la personalidad del asistente que atenderá a tus clientes por WhatsApp."
        : "Define the greeting and personality of the assistant that will handle your customers on WhatsApp.",
      href: "/portal/whatsapp",
      ctaLabel: isEs ? "Configurar asistente" : "Set up assistant",
      completed: whatsappAssistant?.isActive === true,
    });
  }

  if (hasModule("CRM")) {
    steps.push({
      id: "first_lead",
      title: isEs ? "Agrega tu primer lead" : "Add your first lead",
      description: isEs
        ? "Registra manualmente un prospecto, o deja que tus automatizaciones los capturen por ti."
        : "Manually register a prospect, or let your automations capture them for you.",
      href: "/portal/leads",
      ctaLabel: isEs ? "Ir a Leads" : "Go to Leads",
      completed: leadCount > 0,
    });
  }

  if (hasModule("AUTOMATIONS")) {
    steps.push({
      id: "first_automation",
      title: isEs ? "Instala tu primera automatización" : "Install your first automation",
      description: isEs
        ? "Elige un template del marketplace para activar tu primer flujo automatizado."
        : "Choose a template from the marketplace to activate your first automated flow.",
      href: "/portal/templates",
      ctaLabel: isEs ? "Ver templates" : "View templates",
      completed: automationCount > 0,
    });
  }

  // Not gated by any module — every organization can invite teammates.
  steps.push({
    id: "invite_team",
    title: isEs ? "Invita a tu equipo" : "Invite your team",
    description: isEs
      ? "Agrega managers y agentes para que gestionen leads, conversaciones y citas contigo."
      : "Add managers and agents to help you manage leads, conversations and appointments.",
    href: "/portal/settings",
    ctaLabel: isEs ? "Gestionar equipo" : "Manage team",
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
