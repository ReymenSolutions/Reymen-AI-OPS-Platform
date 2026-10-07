import Link from "next/link";
import { requireAdmin } from "@/lib/guards";
import { PageHeader } from "@/components/shared/PageHeader";
import { SmartcardThemeForm } from "@/components/admin/SmartcardThemeForm";

export default async function NewSmartcardThemePage() {
  const session = await requireAdmin();
  if (session.user.role !== "SUPER_ADMIN") {
    return <p className="text-sm text-red-700">Solo un super admin puede crear temas.</p>;
  }

  return (
    <div>
      <Link href="/admin/smartcard/settings" className="mb-4 inline-block text-sm text-slate-500 hover:underline">
        ← Volver a ajustes
      </Link>
      <PageHeader title="Nuevo tema" />
      <SmartcardThemeForm />
    </div>
  );
}
