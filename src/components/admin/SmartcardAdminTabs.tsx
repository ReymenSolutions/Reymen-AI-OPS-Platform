"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { usePreferences } from "@/context/preferences";

// Una sola barra para todo /admin/smartcard, agrupada por para qué sirve cada
// pantalla. La pestaña queda activa también en sus subpáginas (detalle, nuevo…).
const GROUPS = [
  [{ href: "/admin/smartcard", es: "Resumen", en: "Overview", exact: true }],
  [
    { href: "/admin/smartcard/companies", es: "Empresas", en: "Companies" },
    { href: "/admin/smartcard/clients", es: "Titulares", en: "Holders" },
    { href: "/admin/smartcard/cards", es: "Tarjetas", en: "Cards" },
    { href: "/admin/smartcard/profiles", es: "Perfiles", en: "Profiles" },
  ],
  [
    { href: "/admin/smartcard/analytics", es: "Analítica", en: "Analytics" },
    { href: "/admin/smartcard/feedback", es: "Feedback", en: "Feedback" },
  ],
  [
    { href: "/admin/smartcard/users", es: "Administradores", en: "Admins" },
    { href: "/admin/smartcard/settings", es: "Ajustes", en: "Settings" },
  ],
] as const;

export function SmartcardAdminTabs() {
  const pathname = usePathname();
  const { lang } = usePreferences();

  return (
    <nav aria-label="SmartCard" className="mb-6 -mx-1 flex items-end gap-1 overflow-x-auto border-b border-slate-200 px-1">
      {GROUPS.map((group, g) => (
        <div key={g} className={cn("flex flex-shrink-0 gap-1", g > 0 && "ml-2 border-l border-slate-200 pl-3")}>
          {group.map((tab) => {
            const active = "exact" in tab ? pathname === tab.href : pathname === tab.href || pathname.startsWith(`${tab.href}/`);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                  active ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-700"
                )}
              >
                {lang === "en" ? tab.en : tab.es}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
