import Link from "next/link";
import { Webhook as WebhookIcon } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getServerT } from "@/lib/i18n-server";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/EmptyState";
import { RetryWebhookEventButton } from "@/components/admin/RetryWebhookEventButton";
import { RetryAllFailedWebhooksButton } from "@/components/admin/RetryAllFailedWebhooksButton";
import { formatDateTime } from "@/lib/utils";
import { MAX_WEBHOOK_ATTEMPTS } from "@/lib/webhook-retry";

async function getWebhookEvents(filter?: string) {
  return prisma.webhookEvent.findMany({
    where: filter === "failed" ? { status: "FAILED" } : {},
    orderBy: { createdAt: "desc" },
    take: 100,
    // Explicit select (no `payload`) — that column holds the entire raw
    // webhook body and is never rendered on this list, just noise to pull
    // and serialize for up to 100 rows on every page load.
    select: {
      id: true,
      status: true,
      eventType: true,
      errorMessage: true,
      attempts: true,
      createdAt: true,
      organization: { select: { name: true } },
    },
  });
}

export default async function AdminWebhooksPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { filter } = await searchParams;
  const [t, events] = await Promise.all([getServerT(), getWebhookEvents(filter)]);
  const failedCount = events.filter((e) => e.status === "FAILED").length;
  const retryableFailedCount = events.filter(
    (e) => e.status === "FAILED" && e.attempts < MAX_WEBHOOK_ATTEMPTS
  ).length;

  return (
    <div>
      <PageHeader
        title={t.adminWebhooksTitle}
        description={`${events.length} ${t.adminWebhooksDesc}`}
        actions={<RetryAllFailedWebhooksButton disabled={retryableFailedCount === 0} />}
      />

      <div className="mb-4 flex items-center gap-2 flex-wrap">
        <Link
          href="/admin/webhooks"
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            !filter ? "bg-brand-600 text-white" : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          {t.adminWebhooksFilterAll}
        </Link>
        <Link
          href="/admin/webhooks?filter=failed"
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            filter === "failed" ? "bg-brand-600 text-white" : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          {t.adminWebhooksFilterFailed} ({failedCount})
        </Link>
      </div>

      {events.length === 0 ? (
        <Card>
          <CardContent className="py-0">
            <EmptyState
              icon={WebhookIcon}
              title={t.adminWebhooksNoEvents}
              description={t.adminWebhooksNoEventsDesc}
            />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {events.map((event) => (
            <Card key={event.id} className={event.status === "FAILED" ? "border-red-200" : undefined}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <StatusBadge status={event.status} />
                      <Badge variant="secondary" className="font-mono text-xs">{event.eventType}</Badge>
                      <Badge variant="outline" className="text-xs">{event.organization.name}</Badge>
                    </div>
                    {event.errorMessage && (
                      <p className="text-xs text-red-600 truncate max-w-lg">{event.errorMessage}</p>
                    )}
                    <div className="flex items-center gap-3 text-xs text-slate-400 mt-1">
                      <span>{event.attempts} {t.adminWebhooksAttempts}</span>
                      <span>{formatDateTime(event.createdAt)}</span>
                      {event.attempts >= MAX_WEBHOOK_ATTEMPTS && event.status === "FAILED" && (
                        <span className="text-amber-600">{t.adminWebhooksMaxAttemptsReached}</span>
                      )}
                    </div>
                  </div>
                  {event.status === "FAILED" && (
                    <RetryWebhookEventButton
                      eventId={event.id}
                      disabled={event.attempts >= MAX_WEBHOOK_ATTEMPTS}
                    />
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
