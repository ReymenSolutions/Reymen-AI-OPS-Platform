import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/shared/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/EmptyState";
import { CreateTemplatePackageDialog } from "@/components/admin/CreateTemplatePackageDialog";
import { getServerLang } from "@/lib/i18n-server";
import { Package } from "lucide-react";
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

async function getPackages() {
  return prisma.templatePackage.findMany({
    orderBy: [{ isPublished: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      iconEmoji: true,
      isPublished: true,
      name: true,
      description: true,
      industry: true,
      _count: { select: { items: true } },
    },
  });
}

async function getPublishedTemplates() {
  return prisma.automationTemplate.findMany({
    where: { isPublished: true },
    orderBy: [{ industry: "asc" }, { name: "asc" }],
    select: { id: true, name: true, industry: true, iconEmoji: true },
  });
}

export default async function AdminTemplatePackagesPage() {
  const [packages, templates, lang] = await Promise.all([getPackages(), getPublishedTemplates(), getServerLang()]);
  const published = packages.filter((p) => p.isPublished).length;
  const INDUSTRY_LABELS = lang === "es" ? INDUSTRY_LABELS_ES : INDUSTRY_LABELS_EN;

  return (
    <div>
      <PageHeader
        title={lang === "es" ? "Paquetes por industria" : "Industry packages"}
        description={lang === "es" ? `${packages.length} paquetes · ${published} publicados` : `${packages.length} packages · ${published} published`}
        actions={<CreateTemplatePackageDialog templates={templates} />}
      />

      {packages.length === 0 ? (
        <Card>
          <CardContent className="py-0">
            <EmptyState
              icon={Package}
              title={lang === "es" ? "Sin paquetes" : "No packages"}
              description={lang === "es" ? "Agrupa templates publicados en un paquete que un cliente instale de un clic." : "Group published templates into a package a client installs in one click."}
              action={<CreateTemplatePackageDialog templates={templates} />}
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {packages.map((p) => (
            <Link key={p.id} href={`/admin/template-packages/${p.id}`}>
              <Card className="h-full cursor-pointer hover:border-brand-300 hover:shadow-md transition-all">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <span className="text-3xl leading-none">{p.iconEmoji}</span>
                    {p.isPublished ? (
                      <Badge variant="success">{lang === "es" ? "Publicado" : "Published"}</Badge>
                    ) : (
                      <Badge variant="secondary">{lang === "es" ? "Borrador" : "Draft"}</Badge>
                    )}
                  </div>

                  <h3 className="font-semibold text-slate-900 mb-1 leading-tight">{p.name}</h3>
                  <p className="text-xs text-slate-500 line-clamp-2 mb-3">{p.description}</p>

                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <Badge variant="outline">{INDUSTRY_LABELS[p.industry] ?? p.industry}</Badge>
                    <span>{p._count.items} template{p._count.items === 1 ? "" : "s"}</span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
