"use client";

import { useState, useTransition } from "react";
import { Bot, User, Settings, Loader2, ChevronUp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { getOlderMessages } from "@/actions/conversations";
import { formatDateTime } from "@/lib/utils";
import type { Message } from "@prisma/client";

interface MessageThreadProps {
  conversationId: string;
  contactName: string | null;
  initialMessages: Message[];
  hasMoreInitially: boolean;
}

export function MessageThread({ conversationId, contactName, initialMessages, hasMoreInitially }: MessageThreadProps) {
  const [messages, setMessages] = useState(initialMessages);
  const [hasMore, setHasMore] = useState(hasMoreInitially);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function loadOlder() {
    if (messages.length === 0) return;
    setError(null);
    startTransition(async () => {
      try {
        const result = await getOlderMessages(conversationId, messages[0].id);
        setMessages((prev) => [...result.messages, ...prev]);
        setHasMore(result.hasMore);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error al cargar mensajes anteriores");
      }
    });
  }

  return (
    <Card>
      <CardContent className="p-0">
        {messages.length === 0 ? (
          <div className="py-16 text-center text-sm text-slate-400">
            Sin mensajes en esta conversación
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {hasMore && (
              <div className="p-3 text-center border-b border-slate-50">
                <button
                  onClick={loadOlder}
                  disabled={isPending}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-600 hover:text-brand-700 disabled:opacity-50"
                >
                  {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ChevronUp className="h-3.5 w-3.5" />}
                  Cargar mensajes anteriores
                </button>
                {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
              </div>
            )}
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-3 p-4 ${
                  msg.role === "USER" ? "bg-white" : msg.role === "ASSISTANT" ? "bg-slate-50" : "bg-amber-50"
                }`}
              >
                {/* Avatar */}
                <div
                  className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                    msg.role === "USER"
                      ? "bg-slate-200 text-slate-700"
                      : msg.role === "ASSISTANT"
                      ? "bg-brand-100 text-brand-700"
                      : "bg-amber-100 text-amber-700"
                  }`}
                >
                  {msg.role === "USER" ? (
                    <User className="h-4 w-4" />
                  ) : msg.role === "ASSISTANT" ? (
                    <Bot className="h-4 w-4" />
                  ) : (
                    <Settings className="h-4 w-4" />
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium text-slate-700">
                      {msg.role === "USER"
                        ? contactName ?? "Usuario"
                        : msg.role === "ASSISTANT"
                        ? "Asistente AI"
                        : "Sistema"}
                    </span>
                    <span className="text-xs text-slate-400">
                      {formatDateTime(msg.createdAt)}
                    </span>
                  </div>
                  <p className="text-sm text-slate-900 whitespace-pre-wrap leading-relaxed">
                    {msg.content}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
