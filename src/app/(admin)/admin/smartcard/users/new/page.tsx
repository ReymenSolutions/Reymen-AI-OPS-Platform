import Link from "next/link";
import { auth, isAdmin } from "@/lib/auth";
import { PageHeader } from "@/components/shared/PageHeader";
import { SmartcardInviteAdminForm } from "@/components/admin/SmartcardInviteAdminForm";

export default async function NewSmartcardAdminUserPage() {
  const session = await auth();
  if (!session || !isAdmin(session.user.role) || session.user.role !== "SUPER_ADMIN") {
    return <p className="text-sm text-red-700">Solo un super admin puede invitar administradores de SmartCard.</p>;
  }

  return (
    <div>
      <Link href="/admin/smartcard/users" className="mb-4 inline-block text-sm text-slate-500 hover:underline">
        ← Volver a usuarios
      </Link>
      <PageHeader title="Invitar administrador" />
      <SmartcardInviteAdminForm />
    </div>
  );
}
