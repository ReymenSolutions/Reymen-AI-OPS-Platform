import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { getServerT } from "@/lib/i18n-server";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/EmptyState";
import { formatDate } from "@/lib/utils";
import { MessageSquare, ChevronLeft, ChevronRight } from "lucide-react";

const PAGE_SIZE = 50;

export default async function PortalConversationsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const session = await auth();
  if (!session?.user.organizationId) return redirect("/login");

  const { page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);
  const where = { organizationId: session.user.organizationId };

  const [t, conversations, total] = await Promise.all([
    getServerT(),
    prisma.conversation.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      include: { _count: { select: { messages: true } } },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.conversation.count({ where }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <PageHeader
        title={t.conversationsTitle}
        description={`${total} ${t.conversationsCount}`}
      />

      {total === 0 ? (
        <Card>
          <CardContent className="py-0">
            <EmptyState
              icon={MessageSquare}
              title={t.noConversations}
              description={t.conversationsEmptyDesc}
            />
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">{t.colContact}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">{t.colChannel}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">{t.colMessages}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">{t.colStatus}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">{t.colLastActivity}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {conversations.map((conv) => (
                <tr key={conv.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link href={`/portal/conversations/${conv.id}`} className="hover:underline">
                      <p className="font-medium text-slate-900">{conv.contactName ?? t.unknown}</p>
                      {conv.contactPhone && <p className="text-xs text-slate-400">{conv.contactPhone}</p>}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="secondary">{conv.channel}</Badge>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{conv._count.messages}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={conv.status} />
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">{formatDate(conv.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-sm">
              <p className="text-xs text-slate-400">
                {t.paginationPage} {page} {t.paginationOf} {totalPages} · {total} {t.paginationResults}
              </p>
              <div className="flex items-center gap-2">
                <Link
                  href={page > 1 ? `/portal/conversations?page=${page - 1}` : "#"}
                  aria-disabled={page <= 1}
                  className={`inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-medium transition-colors ${
                    page <= 1 ? "opacity-40 pointer-events-none" : "text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  {t.paginationPrev}
                </Link>
                <Link
                  href={page < totalPages ? `/portal/conversations?page=${page + 1}` : "#"}
                  aria-disabled={page >= totalPages}
                  className={`inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-medium transition-colors ${
                    page >= totalPages ? "opacity-40 pointer-events-none" : "text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {t.paginationNext}
                  <ChevronRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
