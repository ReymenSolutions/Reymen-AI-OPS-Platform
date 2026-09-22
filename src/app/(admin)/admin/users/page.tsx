import { auth } from "@/lib/auth";
import { getServerT } from "@/lib/i18n-server";
import { getAllUsers } from "@/actions/admin/users";
import { PageHeader } from "@/components/shared/PageHeader";
import { AdminUsersDirectory } from "@/components/admin/AdminUsersDirectory";

export default async function AdminUsersPage() {
  const [session, t, users] = await Promise.all([auth(), getServerT(), getAllUsers()]);
  const canCreateStandalone = session?.user.role === "SUPER_ADMIN";

  return (
    <div>
      <PageHeader
        title={t.adminNavUsers}
        description={`${users.length} ${t.adminUsersRegistered}`}
      />
      <AdminUsersDirectory
        users={users.map((u) => ({
          id: u.id,
          name: u.name,
          email: u.email,
          role: u.role,
          isActive: u.isActive,
          organizationName: u.organization?.name ?? null,
        }))}
        canCreateStandalone={canCreateStandalone}
      />
    </div>
  );
}
