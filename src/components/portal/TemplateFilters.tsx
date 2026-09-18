"use client";

import { useState, useMemo } from "react";
import { Search, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { InstallTemplateButton } from "@/components/portal/InstallTemplateButton";
import { usePreferences } from "@/context/preferences";

interface Template {
  id: string;
  name: string;
  description: string;
  industry: string;
  category: string;
  iconEmoji: string;
  versions: { version: string }[];
  _count: { installations: number };
}

interface TemplateFiltersProps {
  templates: Template[];
  installedIds: string[];
  industryLabels: Record<string, string>;
  categoryLabels: Record<string, string>;
}

const CATEGORY_OPTIONS_ES = [
  { value: "lead_capture",  label: "Captura de leads" },
  { value: "appointments",  label: "Agendamiento" },
  { value: "follow_up",     label: "Seguimiento" },
  { value: "retention",     label: "Retención" },
  { value: "crm",           label: "CRM" },
  { value: "notifications", label: "Notificaciones" },
  { value: "onboarding",    label: "Onboarding" },
];

const CATEGORY_OPTIONS_EN = [
  { value: "lead_capture",  label: "Lead capture" },
  { value: "appointments",  label: "Appointments" },
  { value: "follow_up",     label: "Follow-up" },
  { value: "retention",     label: "Retention" },
  { value: "crm",           label: "CRM" },
  { value: "notifications", label: "Notifications" },
  { value: "onboarding",    label: "Onboarding" },
];

export function TemplateFilters({ templates, installedIds, industryLabels, categoryLabels }: TemplateFiltersProps) {
  const { lang } = usePreferences();
  const categoryOptions = lang === "es" ? CATEGORY_OPTIONS_ES : CATEGORY_OPTIONS_EN;
  const [query, setQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const installedSet = useMemo(() => new Set(installedIds), [installedIds]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return templates.filter((t) => {
      const matchesQuery = !q
        || t.name.toLowerCase().includes(q)
        || t.description.toLowerCase().includes(q)
        || (industryLabels[t.industry] ?? t.industry).toLowerCase().includes(q);
      const matchesCategory = !selectedCategory || t.category === selectedCategory;
      return matchesQuery && matchesCategory;
    });
  }, [templates, query, selectedCategory, industryLabels]);

  const grouped = useMemo(() => {
    return filtered.reduce<Record<string, Template[]>>((acc, t) => {
      if (!acc[t.industry]) acc[t.industry] = [];
      acc[t.industry].push(t);
      return acc;
    }, {});
  }, [filtered]);

  const industryOrder = ["clinic", "real_estate", "gym", "legal", "workshop", "ecommerce", "general"];
  const orderedKeys = [
    ...industryOrder.filter((k) => grouped[k]),
    ...Object.keys(grouped).filter((k) => !industryOrder.includes(k)),
  ];

  return (
    <div>
      {/* Search + filters */}
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder={lang === "es" ? "Buscar templates..." : "Search templates..."}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full rounded-md border border-slate-200 bg-white py-2 pl-9 pr-9 text-sm focus:border-brand-500 focus:outline-none"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setSelectedCategory(null)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              !selectedCategory ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {lang === "es" ? "Todos" : "All"}
          </button>
          {categoryOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setSelectedCategory(selectedCategory === opt.value ? null : opt.value)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                selectedCategory === opt.value
                  ? "bg-brand-600 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-200 py-12 text-center">
          <p className="text-sm text-slate-400">{lang === "es" ? "No se encontraron templates con esos filtros" : "No templates found with those filters"}</p>
          <button
            onClick={() => { setQuery(""); setSelectedCategory(null); }}
            className="mt-2 text-xs text-brand-600 hover:underline"
          >
            {lang === "es" ? "Limpiar filtros" : "Clear filters"}
          </button>
        </div>
      ) : (
        <div className="space-y-8">
          {orderedKeys.map((industry) => {
            const industryTemplates = grouped[industry] ?? [];
            return (
              <div key={industry}>
                <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-700 uppercase tracking-wide">
                  {industryTemplates[0]?.iconEmoji ?? "⚡"}
                  {industryLabels[industry] ?? industry}
                  <Badge variant="secondary">{industryTemplates.length}</Badge>
                </h2>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {industryTemplates.map((t) => {
                    const isInstalled = installedSet.has(t.id);
                    const latestVersion = t.versions[0]?.version;
                    return (
                      <Card
                        key={t.id}
                        className={`relative transition-all ${
                          isInstalled
                            ? "border-emerald-200 bg-emerald-50/30"
                            : "hover:border-brand-200 hover:shadow-sm"
                        }`}
                      >
                        <CardContent className="p-5">
                          <div className="flex items-start justify-between mb-3">
                            <span className="text-2xl leading-none">{t.iconEmoji}</span>
                            {isInstalled && (
                              <Badge variant="success" className="text-xs">{lang === "es" ? "Instalado" : "Installed"}</Badge>
                            )}
                          </div>
                          <h3 className="font-semibold text-slate-900 mb-1 leading-tight text-sm">{t.name}</h3>
                          <p className="text-xs text-slate-500 line-clamp-3 mb-4">{t.description}</p>
                          <div className="flex flex-wrap items-center gap-1.5 mb-4">
                            <Badge variant="secondary" className="text-xs">
                              {categoryLabels[t.category] ?? t.category}
                            </Badge>
                            {latestVersion && (
                              <Badge variant="outline" className="text-xs">v{latestVersion}</Badge>
                            )}
                            {t._count.installations > 0 && (
                              <span className="text-xs text-slate-400">{t._count.installations} {lang === "es" ? "instalaciones" : "installs"}</span>
                            )}
                          </div>
                          <InstallTemplateButton templateId={t.id} isInstalled={isInstalled} />
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
