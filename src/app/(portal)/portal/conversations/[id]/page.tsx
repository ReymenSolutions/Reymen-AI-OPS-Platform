import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Bot } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireModule } from "@/lib/modules";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { ConversationActions } from "@/components/portal/ConversationActions";
import { MessageThread } from "@/components/portal/MessageThread";
import { formatDateTime } from "@/lib/utils";

const MESSAGE_PAGE_SIZE = 50;

async function getConversation(id: string, orgId: string) {
  const conv = await prisma.conversation.findFirst({
    where: { id, organizationId: orgId },
    include: {
      messages: { orderBy: { createdAt: "desc" }, take: MESSAGE_PAGE_SIZE },
      _count: { select: { messages: true } },
    },
  });
  if (!conv) return null;

  return {
    ...conv,
    messages: conv.messages.reverse(),
    hasMoreMessages: conv._count.messages > MESSAGE_PAGE_SIZE,
  };
}

export default async function ConversationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user.organizationId) return redirect("/login");
  await requireModule(session.user.organizationId, "AI_WHATSAPP");

  const conv = await getConversation(id, session.user.organizationId);
  if (!conv) notFound();

  return (
    <div>
      <div className="mb-4">
        <Link
          href="/portal/conversations"
          className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" /> Volver a conversaciones
        </Link>
      </div>

      <PageHeader
        title={conv.contactName ?? conv.contactPhone ?? "Conversación"}
        description={`${conv.channel} · ${conv._count.messages} mensajes`}
        actions={<ConversationActions conversationId={conv.id} status={conv.status} />}
      />

      {/* Status & meta */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <StatusBadge status={conv.status} />
        <Badge variant="secondary" className="capitalize">{conv.channel}</Badge>
        {conv.aiHandled && (
          <span className="flex items-center gap-1 text-xs text-slate-500">
            <Bot className="h-3 w-3" /> Manejado por IA
          </span>
        )}
        {conv.escalatedAt && (
          <span className="text-xs text-amber-600">
            Escalado {formatDateTime(conv.escalatedAt)}
          </span>
        )}
        {conv.resolvedAt && (
          <span className="text-xs text-emerald-600">
            Resuelto {formatDateTime(conv.resolvedAt)}
          </span>
        )}
      </div>

      {/* Message thread */}
      <MessageThread
        conversationId={conv.id}
        contactName={conv.contactName}
        initialMessages={conv.messages}
        hasMoreInitially={conv.hasMoreMessages}
      />
    </div>
  );
}
