import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Layers, Building2 } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PublishPackageButton } from "@/components/admin/PublishPackageButton";
import { EditPackageItemsDialog } from "@/components/admin/EditPackageItemsDialog";
import { getServerLang } from "@/lib/i18n-server";

const INDUSTRY_LABELS_ES: Record<string, string> = {
  clinic: "Clínica / Salud", real_estate: "Inmobiliaria", gym: "Gimnasio",
  legal: "Legal", workshop: "Taller", ecommerce: "E-commerce",
  restaurant: "Restaurante", education: "Educación", general: "General",
};

const INDUSTRY_LABELS_EN: Record<string, string> = {
  clinic: "Clinic / Health", real_estate: "Real Estate", gym: "Gym",
  legal: "Legal", workshop: "Workshop", ecommerce: "E-commerce",
  restaurant: "Restaurant", education: "Education", general: "General",
};

async function getPackage(packageId: string) {
  return prisma.templatePackage.findUnique({
    where: { id: packageId },
    include: {
      items: {
        orderBy: { order: "asc" },
        include: { template: { select: { id: true, name: true, iconEmoji: true, isPublished: true, industry: true } } },
      },
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

export default async function TemplatePackageDetailPage({
  params,
}: {
  params: Promise<{ packageId: string }>;
}) {
  const { packageId } = await params;
  const [pkg, templates, lang] = await Promise.all([getPackage(packageId), getPublishedTemplates(), getServerLang()]);
  if (!pkg) notFound();

  const INDUSTRY_LABELS = lang === "es" ? INDUSTRY_LABELS_ES : INDUSTRY_LABELS_EN;
  const unpublishedInPackage = pkg.items.filter((i) => !i.template.isPublished);

  return (
    <div>
      <div className="mb-4">
        <Link href="/admin/template-packages" className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900">
          <ArrowLeft className="h-4 w-4" /> {lang === "es" ? "Volver a paquetes" : "Back to packages"}
        </Link>
      </div>

      <PageHeader
        title={`${pkg.iconEmoji} ${pkg.name}`}
        description={`${INDUSTRY_LABELS[pkg.industry] ?? pkg.industry} · ${pkg.items.length} templates`}
        actions={<PublishPackageButton packageId={pkg.id} isPublished={pkg.isPublished} />}
      />

      {unpublishedInPackage.length > 0 && (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          {lang === "es"
            ? `${unpublishedInPackage.length} de los templates de este paquete no están publicados y no se instalarán para el cliente hasta que se publiquen: ${unpublishedInPackage.map((i) => i.template.name).join(", ")}.`
            : `${unpublishedInPackage.length} template(s) in this package are not published and won't be installed for the client until they are: ${unpublishedInPackage.map((i) => i.template.name).join(", ")}.`}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Layers className="h-4 w-4" />
              {lang === "es" ? "Templates incluidos" : "Included templates"}
            </CardTitle>
            <EditPackageItemsDialog
              packageId={pkg.id}
              templates={templates}
              currentTemplateIds={pkg.items.map((i) => i.templateId)}
            />
          </CardHeader>
          <CardContent>
            {pkg.items.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-400">{lang === "es" ? "Sin templates. Edita el paquete para agregar." : "No templates. Edit the package to add some."}</p>
            ) : (
              <div className="space-y-2">
                {pkg.items.map((item) => (
                  <div key={item.id} className="flex items-center justify-between rounded-lg border border-slate-100 p-3">
                    <div className="flex items-center gap-2">
                      <span className="text-lg leading-none">{item.template.iconEmoji}</span>
                      <span className="text-sm font-medium text-slate-900">{item.template.name}</span>
                    </div>
                    {item.template.isPublished ? (
                      <Badge variant="success" className="text-xs">{lang === "es" ? "Publicado" : "Published"}</Badge>
                    ) : (
                      <Badge variant="secondary" className="text-xs">{lang === "es" ? "Sin publicar" : "Unpublished"}</Badge>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              {lang === "es" ? "Descripción" : "Description"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-slate-600 whitespace-pre-wrap leading-relaxed">{pkg.description}</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
