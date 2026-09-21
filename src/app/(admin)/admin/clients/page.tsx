import { Users } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getServerT } from "@/lib/i18n-server";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { CreateClientDialog } from "@/components/admin/CreateClientDialog";
import { ClientRow } from "@/components/admin/ClientRow";

async function getClients() {
  return prisma.organization.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { leads: true, automations: true, requests: true } },
    },
  });
}

export default async function AdminClientsPage() {
  const [t, clients] = await Promise.all([getServerT(), getClients()]);

  return (
    <div>
      <PageHeader
        title={t.adminClientsTitle}
        description={`${clients.length} ${t.adminOrgsRegistered}`}
        actions={<CreateClientDialog />}
      />

      {clients.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Users className="mx-auto h-10 w-10 text-slate-300 mb-3" />
            <p className="text-sm font-medium text-slate-600">{t.adminNoClients}</p>
            <p className="text-xs text-slate-400 mt-1">{t.adminCreateFirstClient}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-lg border border-slate-200 bg-white overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">{t.adminColCompany}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">{t.plan}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">{t.leads}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">{t.adminColAutomations}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">{t.colStatus}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">{t.createdOn}</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {clients.map((client) => (
                <ClientRow
                  key={client.id}
                  client={client}
                  viewDetailLabel={t.viewDetail}
                  statusActiveLabel={t.statusActive}
                  inactiveLabel={t.inactive}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
