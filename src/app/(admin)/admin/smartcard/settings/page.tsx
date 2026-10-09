import Link from "next/link";
import { requireAdmin } from "@/lib/guards";
import {
  listSmartcardThemesAdmin,
  listSmartcardDestinationTypesAdmin,
  listSmartcardReservedSlugs,
} from "@/lib/smartcard-admin";
import { passesWcagAA } from "@/lib/smartcard-theme";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SmartcardDestinationTypesSection } from "@/components/admin/SmartcardDestinationTypesSection";
import { SmartcardReservedSlugsSection } from "@/components/admin/SmartcardReservedSlugsSection";
import { Settings } from "lucide-react";

export default async function SmartcardSettingsPage() {
  const session = await requireAdmin();
  const canEdit = session.user.role === "SUPER_ADMIN";

  const [themes, destinationTypes, reservedSlugs] = await Promise.all([
    listSmartcardThemesAdmin(),
    listSmartcardDestinationTypesAdmin(),
    listSmartcardReservedSlugs(),
  ]);

  return (
    <div>
      <PageHeader title="Ajustes" description="Temas, tipos de destino y slugs reservados — catálogos compartidos por todas las tarjetas y perfiles." />

      {!canEdit && (
        <p className="mb-6 rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-500">
          Puedes ver estos catálogos, pero solo un super admin puede modificarlos.
        </p>
      )}

      {themes === null || destinationTypes === null || reservedSlugs === null ? (
        <EmptyState
          icon={Settings}
          title="SmartCard no está configurado en este servidor"
          description="Faltan SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en el .env."
        />
      ) : (
        <>
          <section className="mb-10">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-xs font-medium uppercase tracking-wide text-slate-500">Temas ({themes.length})</h2>
              {canEdit && (
                <Button asChild variant="ghost" size="sm">
                  <Link href="/admin/smartcard/settings/themes/new">+ Nuevo tema</Link>
                </Button>
              )}
            </div>
            <ul className="divide-y divide-slate-100 rounded-md border border-slate-200 text-sm">
              {themes.map((t) => {
                const lowContrast = !passesWcagAA(t.fields.accentColor, "#262922") || !passesWcagAA(t.fields.primaryColor, "#FFFFFF", true);
                return (
                  <li key={t.id} className="flex items-center justify-between px-4 py-3">
                    <span className="flex items-center gap-3">
                      <span className="flex gap-1">
                        <span title="Color primario" className="h-4 w-4 rounded-full border border-slate-300" style={{ backgroundColor: t.fields.primaryColor }} />
                        <span title="Color de acento" className="h-4 w-4 rounded-full border border-slate-300" style={{ backgroundColor: t.fields.accentColor }} />
                      </span>
                      {canEdit ? (
                        <Link href={`/admin/smartcard/settings/themes/${t.id}`} className="font-medium text-slate-900 hover:underline">
                          {t.name}
                        </Link>
                      ) : (
                        <span className="font-medium text-slate-900">{t.name}</span>
                      )}
                      <span className="text-slate-400">/{t.slug}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      {lowContrast && (
                        <Badge
                          variant="outline"
                          className="border-amber-300 text-amber-700"
                          title="El texto del botón de contacto o los íconos podrían no leerse bien con estos colores (contraste bajo WCAG AA)."
                        >
                          ⚠ contraste bajo
                        </Badge>
                      )}
                      <Badge variant={t.isActive ? "default" : "outline"}>{t.isActive ? "Activo" : "Inactivo"}</Badge>
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>

          <SmartcardDestinationTypesSection initial={destinationTypes} canEdit={canEdit} />
          <SmartcardReservedSlugsSection initial={reservedSlugs} canEdit={canEdit} />
        </>
      )}
    </div>
  );
}
