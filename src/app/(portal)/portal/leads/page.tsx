import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getServerT } from "@/lib/i18n-server";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { CreateLeadDialog } from "@/components/portal/CreateLeadDialog";
import { ExportLeadsButton } from "@/components/portal/ExportLeadsButton";
import { LeadTableClient } from "@/components/portal/LeadTableClient";
import { EmptyState } from "@/components/shared/EmptyState";
import { Users } from "lucide-react";
import type { LeadStatus, Prisma } from "@prisma/client";

const PAGE_SIZE = 50;

const VALID_STATUSES: LeadStatus[] = ["NEW", "CONTACTED", "QUALIFIED", "PROPOSAL", "WON", "LOST"];

function parseStatus(status: string | undefined): LeadStatus | "ALL" {
  return status && VALID_STATUSES.includes(status as LeadStatus) ? (status as LeadStatus) : "ALL";
}

async function getLeads(
  orgId: string,
  { query, status, page }: { query?: string; status: LeadStatus | "ALL"; page: number }
) {
  const where: Prisma.LeadWhereInput = {
    organizationId: orgId,
    deletedAt: null,
    ...(status !== "ALL" ? { status } : {}),
    ...(query
      ? {
          OR: [
            { name: { contains: query, mode: "insensitive" } },
            { email: { contains: query, mode: "insensitive" } },
            { phone: { contains: query, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [leads, total, totalUnfiltered] = await Promise.all([
    prisma.lead.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.lead.count({ where }),
    prisma.lead.count({ where: { organizationId: orgId, deletedAt: null } }),
  ]);

  return { leads, total, totalUnfiltered };
}

export default async function PortalLeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string }>;
}) {
  const session = await auth();
  if (!session?.user.organizationId) return redirect("/login");

  const { q, status: statusParam, page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);
  const status = parseStatus(statusParam);

  const [t, { leads, total, totalUnfiltered }] = await Promise.all([
    getServerT(),
    getLeads(session.user.organizationId, { query: q, status, page }),
  ]);

  return (
    <div>
      <PageHeader
        title={t.leadsTitle}
        description={`${totalUnfiltered} ${t.totalLeadsCount}`}
        actions={
          <div className="flex items-center gap-2">
            {totalUnfiltered > 0 && <ExportLeadsButton />}
            <CreateLeadDialog />
          </div>
        }
      />

      {totalUnfiltered === 0 ? (
        <Card>
          <CardContent className="py-0">
            <EmptyState
              icon={Users}
              title={t.noLeads}
              description={t.leadsEmptyDesc}
              action={<CreateLeadDialog />}
            />
          </CardContent>
        </Card>
      ) : (
        <LeadTableClient leads={leads} total={total} page={page} pageSize={PAGE_SIZE} query={q ?? ""} status={status} />
      )}
    </div>
  );
}
