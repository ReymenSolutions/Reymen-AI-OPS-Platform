import { prisma } from "@/lib/prisma";
import { getServerT } from "@/lib/i18n-server";
import { PageHeader } from "@/components/shared/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { UpdateRequestStatusSelect } from "@/components/admin/UpdateRequestStatusSelect";
import { formatDate } from "@/lib/utils";
import { FileText } from "lucide-react";

type PriorityVariant = "secondary" | "warning" | "destructive";

const PRIORITY_VARIANT: Record<string, PriorityVariant> = {
  low: "secondary",
  medium: "warning",
  high: "destructive",
};

async function getRequests() {
  return prisma.request.findMany({
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    include: { organization: { select: { name: true } } },
  });
}

export default async function AdminRequestsPage() {
  const [t, requests] = await Promise.all([getServerT(), getRequests()]);
  const openCount = requests.filter((r) => r.status === "OPEN").length;

  const priorityLabels: Record<string, string> = {
    low: t.adminPriorityLow,
    medium: t.adminPriorityMedium,
    high: t.adminPriorityHigh,
  };

  return (
    <div>
      <PageHeader
        title={t.requests}
        description={`${openCount} ${t.adminOpenPlural} · ${requests.length} ${t.requestsTotal}`}
      />

      {requests.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <FileText className="mx-auto h-10 w-10 text-slate-300 mb-3" />
            <p className="text-sm text-slate-500">{t.adminNoRequestsYet}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-lg border border-slate-200 bg-white overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">{t.adminColRequest}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">{t.adminColClient}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">{t.adminColType}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">{t.adminColPriority}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">{t.colStatus}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">{t.adminColDate}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {requests.map((req) => (
                <tr key={req.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-900">{req.title}</p>
                    <p className="text-xs text-slate-400 truncate max-w-[250px]">{req.description}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{req.organization.name}</td>
                  <td className="px-4 py-3">
                    <Badge variant="secondary">{req.type}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={PRIORITY_VARIANT[req.priority] ?? "secondary"}>
                      {priorityLabels[req.priority] ?? req.priority}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <UpdateRequestStatusSelect requestId={req.id} currentStatus={req.status} />
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">{formatDate(req.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
