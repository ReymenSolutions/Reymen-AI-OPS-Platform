import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/guards";
import { getSmartcardThemeAdmin } from "@/lib/smartcard-admin";
import { PageHeader } from "@/components/shared/PageHeader";
import { SmartcardThemeForm } from "@/components/admin/SmartcardThemeForm";

export default async function SmartcardThemeDetailPage({
  params,
}: {
  params: Promise<{ themeId: string }>;
}) {
  const session = await requireAdmin();
  const { themeId } = await params;
  const theme = await getSmartcardThemeAdmin(themeId);
  if (!theme) notFound();

  return (
    <div>
      <Link href="/admin/smartcard/settings" className="mb-4 inline-block text-sm text-slate-500 hover:underline">
        ← Volver a ajustes
      </Link>
      <PageHeader title={theme.name} />

      {session.user.role !== "SUPER_ADMIN" ? (
        <p className="text-sm text-slate-500">Solo un super admin puede editar temas.</p>
      ) : (
        <SmartcardThemeForm
          themeId={theme.id}
          initialName={theme.name}
          initialSlug={theme.slug}
          initialFields={theme.fields}
          initialIsActive={theme.isActive}
        />
      )}
    </div>
  );
}
