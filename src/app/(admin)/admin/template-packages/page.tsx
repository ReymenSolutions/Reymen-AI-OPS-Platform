import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/shared/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/EmptyState";
import { CreateTemplatePackageDialog } from "@/components/admin/CreateTemplatePackageDialog";
import { Package } from "lucide-react";
import Link from "next/link";

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
  const [packages, templates] = await Promise.all([getPackages(), getPublishedTemplates()]);
  const published = packages.filter((p) => p.isPublished).length;

  return (
    <div>
      <PageHeader
        title="Paquetes por industria"
        description={`${packages.length} paquetes · ${published} publicados`}
        actions={<CreateTemplatePackageDialog templates={templates} />}
      />

      {packages.length === 0 ? (
        <Card>
          <CardContent className="py-0">
            <EmptyState
              icon={Package}
              title="Sin paquetes"
              description="Agrupa templates publicados en un paquete que un cliente instale de un clic."
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
                      <Badge variant="success">Publicado</Badge>
                    ) : (
                      <Badge variant="secondary">Borrador</Badge>
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
