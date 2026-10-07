import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/guards";
import { getSmartcardCompanyAdminDetail, listSmartcardCompanyUsersAdmin } from "@/lib/smartcard-admin";
import { PageHeader } from "@/components/shared/PageHeader";
import { SmartcardCompanyForm } from "@/components/admin/SmartcardCompanyForm";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default async function SmartcardCompanyDetailPage({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  await requireAdmin();
  const { companyId } = await params;

  const [company, users] = await Promise.all([
    getSmartcardCompanyAdminDetail(companyId),
    listSmartcardCompanyUsersAdmin(companyId),
  ]);

  if (!company) notFound();

  return (
    <div>
      <Link href="/admin/smartcard/companies" className="mb-4 inline-block text-sm text-slate-500 hover:underline">
        ← Volver a empresas
      </Link>

      <PageHeader title={company.name} description={company.planName ? `Plan: ${company.planName}` : "Sin plan asignado"} />

      <SmartcardCompanyForm
        companyId={company.id}
        initial={{
          name: company.name,
          slug: company.slug,
          industry: company.industry,
          billingEmail: company.billingEmail,
          timezone: company.timezone,
          status: company.status,
        }}
      />

      <section className="mt-8 border-t border-slate-200 pt-6">
        <h2 className="text-sm font-semibold text-slate-500">SmartCard SSO (Reymen)</h2>
        <p className="mt-1 text-sm text-slate-500">
          Cuando está vinculada, un usuario de esa organización con el módulo NFC/QR activo entra aquí sin pedir contraseña
          otra vez. El vínculo se cambia desde el detalle de la organización, no desde aquí.
        </p>
        <div className="mt-3">
          {company.linkedOrgId ? (
            <Link href={`/admin/clients/${company.linkedOrgId}`} className="text-sm text-brand-600 hover:underline">
              Vinculada a {company.linkedOrgName ?? "una organización"} — ver/cambiar vínculo
            </Link>
          ) : (
            <Badge variant="outline" className="border-slate-300 text-slate-500">
              Sin vincular
            </Badge>
          )}
        </div>
      </section>

      <section className="mt-6">
        <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Usuarios de la empresa ({users.length})</h2>
        {users.length === 0 && <p className="text-sm text-slate-400">Sin usuarios todavía.</p>}
        {users.length > 0 && (
          <Card>
            <CardContent className="flex flex-col divide-y divide-slate-100 p-0">
              {users.map((u) => (
                <div key={u.userId} className="flex items-center justify-between px-4 py-3 text-sm">
                  <span className="text-slate-700">{u.email ?? u.userId}</span>
                  <span className="text-slate-400">
                    {u.roleName ?? "—"} · {u.status}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  );
}
