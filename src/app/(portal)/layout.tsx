import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getEnabledModules } from "@/lib/modules";
import { PortalSidebar } from "@/components/portal/PortalSidebar";
import { TopBar } from "@/components/shared/TopBar";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session) return redirect("/login");

  const orgId = session.user.organizationId;
  if (!orgId) return redirect("/login");

  // Re-validated on every request (not just at login) so deactivating a
  // team member or suspending their organization takes effect immediately,
  // rather than only blocking their next sign-in.
  const currentUser = await prisma.user.findUnique({
    where: { id: session.user.id, isActive: true },
    select: {
      organization: { select: { id: true, name: true, logoUrl: true, isActive: true } },
    },
  });

  if (!currentUser?.organization?.isActive) return redirect("/login");
  const org = currentUser.organization;
  const enabledModules = await getEnabledModules(org.id);

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <PortalSidebar orgName={org.name} orgLogoUrl={org.logoUrl} enabledModules={enabledModules} />
      <div className="flex flex-1 flex-col min-h-0">
        <TopBar />
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
