import { redirect } from "next/navigation";
import { auth, isAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AdminShell } from "@/components/admin/AdminShell";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session || !isAdmin(session.user.role)) return redirect("/login");

  // Re-validated on every request (not just at login) so deactivating an
  // admin account takes effect immediately rather than only blocking their
  // next sign-in. Single query (with the org relation included) instead of
  // two round trips — this layout re-runs on every admin navigation.
  const currentUser = await prisma.user.findUnique({
    where: { id: session.user.id, isActive: true },
    select: { id: true, organization: { select: { logoUrl: true } } },
  });
  if (!currentUser) return redirect("/login");

  const hasOrganization = !!session.user.organizationId;
  const orgLogoUrl = currentUser.organization?.logoUrl ?? null;

  return (
    <AdminShell
      adminName={session.user.name ?? "Reymen"}
      orgLogoUrl={orgLogoUrl}
      personalImageUrl={session.user.image ?? null}
      hasOrganization={hasOrganization}
    >
      {children}
    </AdminShell>
  );
}
