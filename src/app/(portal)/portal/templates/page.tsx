import { redirect } from "next/navigation";
import { Zap } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireModule } from "@/lib/modules";
import { PageHeader } from "@/components/shared/PageHeader";
import { TemplateFilters } from "@/components/portal/TemplateFilters";
import { TemplatePackages } from "@/components/portal/TemplatePackages";

const INDUSTRY_LABELS: Record<string, string> = {
  clinic:      "Clínica / Salud",
  real_estate: "Inmobiliaria",
  gym:         "Gimnasio",
  legal:       "Legal",
  workshop:    "Taller",
  ecommerce:   "E-commerce",
  restaurant:  "Restaurante",
  education:   "Educación",
  general:     "General",
};

const CATEGORY_LABELS: Record<string, string> = {
  lead_capture:  "Captura de leads",
  appointments:  "Agendamiento",
  follow_up:     "Seguimiento",
  crm:           "CRM",
  retention:     "Retención",
  notifications: "Notificaciones",
  onboarding:    "Onboarding",
};

async function getTemplateMarketplace(orgId: string) {
  const [templates, installations, packages, org] = await Promise.all([
    prisma.automationTemplate.findMany({
      where: { isPublished: true },
      orderBy: [{ industry: "asc" }, { name: "asc" }],
      // Explicit select — the marketplace grid never shows longDescription
      // (a Text column, only used on the template detail page), no reason
      // to pull it for every published template on every org's page load.
      select: {
        id: true,
        name: true,
        description: true,
        industry: true,
        category: true,
        iconEmoji: true,
        versions: { where: { isLatest: true }, take: 1, select: { version: true } },
        _count: { select: { installations: { where: { status: "ACTIVE" } } } },
      },
    }),
    prisma.templateInstallation.findMany({
      where: { organizationId: orgId, status: "ACTIVE" },
      select: { templateId: true },
    }),
    prisma.templatePackage.findMany({
      where: { isPublished: true },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        description: true,
        industry: true,
        iconEmoji: true,
        items: {
          orderBy: { order: "asc" },
          where: { template: { isPublished: true } },
          select: { template: { select: { id: true, name: true, iconEmoji: true } } },
        },
      },
    }),
    prisma.organization.findUniqueOrThrow({ where: { id: orgId }, select: { industry: true } }),
  ]);

  const installedIds = installations.map((i) => i.templateId);
  return { templates, installedIds, packages, orgIndustry: org.industry };
}

export default async function PortalTemplatesPage() {
  const session = await auth();
  if (!session?.user.organizationId) return redirect("/login");
  const orgId = session.user.organizationId;

  // Installing a template (individually or via a package) always creates an
  // Automation — the whole marketplace is a AUTOMATIONS-module experience,
  // same gate the install action itself already enforces server-side.
  await requireModule(orgId, "AUTOMATIONS");

  const { templates, installedIds, packages, orgIndustry } = await getTemplateMarketplace(orgId);

  return (
    <div>
      <PageHeader
        title="Templates de Automatización"
        description={`${templates.length} templates disponibles · ${installedIds.length} instalados`}
      />

      <div className="mb-5 rounded-lg border border-brand-100 bg-brand-50 p-4">
        <div className="flex items-start gap-3">
          <Zap className="h-5 w-5 text-brand-600 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-brand-900">Templates pre-construidos por Reymen</p>
            <p className="text-sm text-brand-700 mt-0.5">
              Instala un template en un clic y activa automatizaciones probadas para tu industria.
              Usa el buscador o los filtros de categoría para encontrar el template adecuado.
            </p>
          </div>
        </div>
      </div>

      {packages.length > 0 && (
        <TemplatePackages
          packages={packages}
          installedTemplateIds={installedIds}
          orgIndustry={orgIndustry}
          industryLabels={INDUSTRY_LABELS}
        />
      )}

      <TemplateFilters
        templates={templates}
        installedIds={installedIds}
        industryLabels={INDUSTRY_LABELS}
        categoryLabels={CATEGORY_LABELS}
      />
    </div>
  );
}

