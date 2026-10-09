import { MessageSquareWarning } from "lucide-react";
import { requireAdmin } from "@/lib/guards";
import { listSmartcardFeedback } from "@/lib/smartcard-admin";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { Badge } from "@/components/ui/badge";
import { SmartcardFeedbackForm } from "@/components/admin/SmartcardFeedbackForm";

const SOURCE_LABELS: Record<string, string> = {
  public_profile: "Perfil público",
  admin_panel: "Panel admin",
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" });
}

/**
 * Admin → SmartCard → Feedback. Reemplaza admin.reymen.mx/feedback --
 * reportes de problemas desde el perfil público de un cliente o desde un
 * panel admin (ahora, desde dos paneles: admin.reymen.mx y este). Abierto a
 * ADMIN y SUPER_ADMIN por igual, sin flujo de triage todavía (solo lectura
 * + reportar), igual que en el origen.
 */
export default async function SmartcardFeedbackPage() {
  await requireAdmin();
  const reports = await listSmartcardFeedback();

  return (
    <div>
      <PageHeader
        title="Feedback"
        description="Reportes de problemas, desde el perfil público de un cliente o desde un panel admin."
      />

      <section className="mb-10 rounded-md border border-slate-200 p-4">
        <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-slate-500">Reportar un problema</h2>
        <SmartcardFeedbackForm />
      </section>

      {reports === null && (
        <EmptyState
          icon={MessageSquareWarning}
          title="SmartCard no está configurado en este servidor"
          description="Faltan SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en el .env."
        />
      )}

      {reports?.length === 0 && <EmptyState icon={MessageSquareWarning} title="Sin reportes todavía." />}

      {reports && reports.length > 0 && (
        <section>
          <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
            Reportes ({reports.length}
            {reports.length === 200 ? "+" : ""})
          </h2>
          <ul className="divide-y divide-slate-100 rounded-md border border-slate-200 text-sm">
            {reports.map((r) => (
              <li key={r.id} className="flex flex-col gap-1 px-3 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                  <span className="flex items-center gap-2">
                    <Badge variant="secondary">{SOURCE_LABELS[r.source] ?? r.source}</Badge>
                    {r.profileDisplayName && (
                      <span>
                        · {r.profileDisplayName} (/{r.profileSlug})
                      </span>
                    )}
                    {r.adminName && <span>· reportado por {r.adminName}</span>}
                  </span>
                  <span>{fmtDate(r.createdAt)}</span>
                </div>
                <p className="whitespace-pre-wrap text-slate-900">{r.message}</p>
                {r.contactEmail && <p className="text-xs text-slate-500">Contacto: {r.contactEmail}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
