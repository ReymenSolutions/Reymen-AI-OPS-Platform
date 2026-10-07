import Link from "next/link";
import { notFound } from "next/navigation";
import { auth, isAdmin } from "@/lib/auth";
import { getSmartcardAdminUser } from "@/lib/smartcard-admin";
import { PageHeader } from "@/components/shared/PageHeader";
import { SmartcardAdminUserForm } from "@/components/admin/SmartcardAdminUserForm";

export default async function SmartcardAdminUserDetailPage({ params }: { params: Promise<{ userId: string }> }) {
  const session = await auth();
  if (!session || !isAdmin(session.user.role) || session.user.role !== "SUPER_ADMIN") {
    return <p className="text-sm text-red-700">Solo un super admin puede ver usuarios administrativos de SmartCard.</p>;
  }

  const { userId } = await params;
  const user = await getSmartcardAdminUser(userId);
  if (!user) notFound();

  return (
    <div>
      <Link href="/admin/smartcard/users" className="mb-4 inline-block text-sm text-slate-500 hover:underline">
        ← Volver a usuarios
      </Link>
      <PageHeader title={user.fullName} description={user.email ?? "(correo no disponible)"} />

      <SmartcardAdminUserForm
        userId={user.id}
        initialFullName={user.fullName}
        initialRole={user.role}
        initialIsActive={user.isActive}
        email={user.email}
        viewerEmail={session.user.email ?? null}
      />
    </div>
  );
}
