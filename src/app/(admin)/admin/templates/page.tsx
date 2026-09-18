import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/shared/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/EmptyState";
import { CreateTemplateDialog } from "@/components/admin/CreateTemplateDialog";
import { getServerLang } from "@/lib/i18n-server";
import { Layers } from "lucide-react";
import Link from "next/link";

const INDUSTRY_LABELS_ES: Record<string, string> = {
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

const INDUSTRY_LABELS_EN: Record<string, string> = {
  clinic:      "Clinic / Health",
  real_estate: "Real Estate",
  gym:         "Gym",
  legal:       "Legal",
  workshop:    "Workshop",
  ecommerce:   "E-commerce",
  restaurant:  "Restaurant",
  education:   "Education",
  general:     "General",
};

async function getTemplates() {
  return prisma.automationTemplate.findMany({
    orderBy: [{ isPublished: "desc" }, { createdAt: "desc" }],
    // Explicit select — the list view never shows longDescription (a Text
    // column, only used on the template detail page), no reason to pull it
    // for every card on every visit to this page.
    select: {
      id: true,
      iconEmoji: true,
      isPublished: true,
      name: true,
      description: true,
      industry: true,
      currentVersion: true,
      _count: { select: { versions: true, installations: true } },
    },
  });
}

export default async function AdminTemplatesPage() {
  const [templates, lang] = await Promise.all([getTemplates(), getServerLang()]);
  const published = templates.filter((t) => t.isPublished).length;
  const INDUSTRY_LABELS = lang === "es" ? INDUSTRY_LABELS_ES : INDUSTRY_LABELS_EN;

  return (
    <div>
      <PageHeader
        title="Templates"
        description={lang === "es" ? `${templates.length} templates · ${published} publicados` : `${templates.length} templates · ${published} published`}
        actions={<CreateTemplateDialog />}
      />

      {templates.length === 0 ? (
        <Card>
          <CardContent className="py-0">
            <EmptyState
              icon={Layers}
              title={lang === "es" ? "Sin templates" : "No templates"}
              description={lang === "es" ? "Crea el primer template de automatización para tus clientes." : "Create the first automation template for your clients."}
              action={<CreateTemplateDialog />}
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((t) => (
            <Link key={t.id} href={`/admin/templates/${t.id}`}>
              <Card className="h-full cursor-pointer hover:border-brand-300 hover:shadow-md transition-all">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <span className="text-3xl leading-none">{t.iconEmoji}</span>
                    <div className="flex items-center gap-1.5">
                      {t.isPublished ? (
                        <Badge variant="success">{lang === "es" ? "Publicado" : "Published"}</Badge>
                      ) : (
                        <Badge variant="secondary">{lang === "es" ? "Borrador" : "Draft"}</Badge>
                      )}
                    </div>
                  </div>

                  <h3 className="font-semibold text-slate-900 mb-1 leading-tight">{t.name}</h3>
                  <p className="text-xs text-slate-500 line-clamp-2 mb-3">{t.description}</p>

                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{INDUSTRY_LABELS[t.industry] ?? t.industry}</Badge>
                    </div>
                    <div className="flex items-center gap-3">
                      <span>{t._count.versions} {lang === "es" ? "versiones" : "versions"}</span>
                      <span>{t._count.installations} {lang === "es" ? "instalaciones" : "installs"}</span>
                    </div>
                  </div>

                  {t.currentVersion && (
                    <p className="mt-2 text-xs text-brand-600 font-medium">v{t.currentVersion}</p>
                  )}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
