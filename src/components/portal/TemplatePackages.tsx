import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { InstallPackageButton } from "@/components/portal/InstallPackageButton";
import type { Lang } from "@/lib/i18n";

interface PackageTemplate {
  template: { id: string; name: string; iconEmoji: string };
}

interface TemplatePackage {
  id: string;
  name: string;
  description: string;
  industry: string;
  iconEmoji: string;
  items: PackageTemplate[];
}

interface TemplatePackagesProps {
  packages: TemplatePackage[];
  installedTemplateIds: string[];
  orgIndustry: string | null;
  industryLabels: Record<string, string>;
  lang: Lang;
}

export function TemplatePackages({ packages, installedTemplateIds, orgIndustry, industryLabels, lang }: TemplatePackagesProps) {
  const installedSet = new Set(installedTemplateIds);

  // Packages matching the org's own industry lead the row — the whole point
  // of "paquetes por industria" is surfacing the relevant bundle first,
  // not making a clinic scroll past a real-estate package to find theirs.
  const ordered = [...packages].sort((a, b) => {
    const aMatch = a.industry === orgIndustry ? 0 : 1;
    const bMatch = b.industry === orgIndustry ? 0 : 1;
    return aMatch - bMatch;
  });

  return (
    <div className="mb-8">
      <h2 className="mb-4 text-sm font-semibold text-slate-700 uppercase tracking-wide">
        {lang === "es" ? "Paquetes por industria" : "Industry packages"}
      </h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {ordered.map((pkg) => {
          const fullyInstalled = pkg.items.length > 0 && pkg.items.every((i) => installedSet.has(i.template.id));
          const isOrgIndustry = pkg.industry === orgIndustry;
          return (
            <Card
              key={pkg.id}
              className={isOrgIndustry ? "border-brand-200 bg-brand-50/30" : undefined}
            >
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <span className="text-2xl leading-none">{pkg.iconEmoji}</span>
                  <div className="flex items-center gap-1.5">
                    {isOrgIndustry && <Badge variant="default" className="text-xs">{lang === "es" ? "Tu industria" : "Your industry"}</Badge>}
                    <Badge variant="outline" className="text-xs">{industryLabels[pkg.industry] ?? pkg.industry}</Badge>
                  </div>
                </div>
                <h3 className="font-semibold text-slate-900 mb-1 leading-tight text-sm">{pkg.name}</h3>
                <p className="text-xs text-slate-500 line-clamp-2 mb-3">{pkg.description}</p>
                <p className="text-xs text-slate-400 mb-4">
                  {lang === "es" ? "Incluye" : "Includes"}: {pkg.items.map((i) => i.template.name).join(", ")}
                </p>
                <InstallPackageButton packageId={pkg.id} fullyInstalled={fullyInstalled} />
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
