import { redirect } from "next/navigation";
import { SlidersHorizontal, CheckCircle2 } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireModule } from "@/lib/modules";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/EmptyState";
import { PromptDialog } from "@/components/portal/PromptDialog";
import { ActivatePromptButton } from "@/components/portal/ActivatePromptButton";
import { PromptVersionHistoryDialog } from "@/components/portal/PromptVersionHistoryDialog";
import { PortalSectionTabs } from "@/components/portal/PortalSectionTabs";
import { getAiWhatsappTabs } from "@/lib/portal-nav-tabs";
import { formatDate } from "@/lib/utils";
import { getServerT, getServerLang } from "@/lib/i18n-server";
import type { PromptType, UserRole } from "@prisma/client";

const PROMPT_TYPE_LABELS_ES: Record<PromptType, string> = {
  SYSTEM: "Sistema (principal)",
  GREETING: "Saludo inicial",
  LEAD_QUALIFICATION: "Calificación de leads",
  APPOINTMENT_BOOKING: "Agendamiento de citas",
  FAQ: "Preguntas frecuentes",
  ESCALATION: "Escalación",
};

const PROMPT_TYPE_LABELS_EN: Record<PromptType, string> = {
  SYSTEM: "System (main)",
  GREETING: "Initial greeting",
  LEAD_QUALIFICATION: "Lead qualification",
  APPOINTMENT_BOOKING: "Appointment booking",
  FAQ: "Frequently asked questions",
  ESCALATION: "Escalation",
};

const PROMPT_TYPE_DESC_ES: Record<PromptType, string> = {
  SYSTEM: "El prompt principal que define el comportamiento y personalidad del asistente.",
  GREETING: "Cómo el asistente se presenta al inicio de una conversación.",
  LEAD_QUALIFICATION: "Preguntas y flujo para calificar a un lead potencial.",
  APPOINTMENT_BOOKING: "Flujo para agendar citas con los clientes.",
  FAQ: "Instrucciones para responder preguntas frecuentes.",
  ESCALATION: "Cómo el asistente maneja y transfiere al equipo humano.",
};

const PROMPT_TYPE_DESC_EN: Record<PromptType, string> = {
  SYSTEM: "The main prompt that defines the assistant's behavior and personality.",
  GREETING: "How the assistant introduces itself at the start of a conversation.",
  LEAD_QUALIFICATION: "Questions and flow to qualify a potential lead.",
  APPOINTMENT_BOOKING: "Flow to book appointments with clients.",
  FAQ: "Instructions to answer frequently asked questions.",
  ESCALATION: "How the assistant handles and transfers to the human team.",
};

const TYPE_ORDER: PromptType[] = [
  "SYSTEM",
  "GREETING",
  "LEAD_QUALIFICATION",
  "APPOINTMENT_BOOKING",
  "FAQ",
  "ESCALATION",
];

async function getPrompts(orgId: string) {
  return prisma.prompt.findMany({
    where: { organizationId: orgId },
    orderBy: [{ type: "asc" }, { isActive: "desc" }, { createdAt: "desc" }],
  });
}

export default async function PromptsPage() {
  const session = await auth();
  if (!session?.user.organizationId) return redirect("/login");
  await requireModule(session.user.organizationId, "AI_WHATSAPP");

  const [prompts, lang, t] = await Promise.all([getPrompts(session.user.organizationId), getServerLang(), getServerT()]);
  const PROMPT_TYPE_LABELS = lang === "es" ? PROMPT_TYPE_LABELS_ES : PROMPT_TYPE_LABELS_EN;
  const PROMPT_TYPE_DESC = lang === "es" ? PROMPT_TYPE_DESC_ES : PROMPT_TYPE_DESC_EN;
  const activeCount = prompts.filter((p) => p.isActive).length;

  const grouped = prompts.reduce<Record<string, typeof prompts>>((acc, p) => {
    if (!acc[p.type]) acc[p.type] = [];
    acc[p.type].push(p);
    return acc;
  }, {});

  return (
    <div>
      <PageHeader
        title={lang === "es" ? "Gestor de Prompts" : "Prompt Manager"}
        description={lang === "es" ? `${prompts.length} prompts · ${activeCount} activos` : `${prompts.length} prompts · ${activeCount} active`}
        actions={<PromptDialog mode="create" />}
      />

      <PortalSectionTabs tabs={getAiWhatsappTabs(t, session.user.role as UserRole)} />

      <div className="mb-4 rounded-lg bg-blue-50 border border-blue-100 p-3">
        <p className="text-sm text-blue-700">
          {lang === "es" ? (
            <><strong>¿Cómo funciona?</strong> Solo puede haber un prompt activo por tipo. El prompt <em>Sistema</em> es el más importante — define el comportamiento completo del asistente.</>
          ) : (
            <><strong>How does it work?</strong> Only one prompt can be active per type. The <em>System</em> prompt is the most important — it defines the assistant&apos;s entire behavior.</>
          )}
        </p>
      </div>

      {prompts.length === 0 ? (
        <Card>
          <CardContent className="py-0">
            <EmptyState
              icon={SlidersHorizontal}
              title={lang === "es" ? "Sin prompts configurados" : "No prompts configured"}
              description={lang === "es" ? "Crea tu primer prompt del sistema para personalizar el comportamiento de tu asistente AI." : "Create your first system prompt to customize your AI assistant's behavior."}
              action={<PromptDialog mode="create" defaultType="SYSTEM" />}
            />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {TYPE_ORDER.map((type) => {
            const typePrompts = grouped[type] ?? [];
            const activePrompt = typePrompts.find((p) => p.isActive);

            return (
              <Card key={type}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-sm">{PROMPT_TYPE_LABELS[type]}</CardTitle>
                      <p className="text-xs text-slate-400 mt-0.5">{PROMPT_TYPE_DESC[type]}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {activePrompt ? (
                        <Badge variant="success">
                          <CheckCircle2 className="mr-1 h-3 w-3" />
                          {lang === "es" ? "Activo" : "Active"}
                        </Badge>
                      ) : (
                        <Badge variant="secondary">{lang === "es" ? "Sin activo" : "None active"}</Badge>
                      )}
                      <PromptDialog mode="create" defaultType={type} />
                    </div>
                  </div>
                </CardHeader>

                {typePrompts.length > 0 && (
                  <CardContent className="pt-0">
                    <div className="space-y-2">
                      {typePrompts.map((prompt) => (
                        <div
                          key={prompt.id}
                          className={`rounded-lg border p-3 ${
                            prompt.isActive
                              ? "border-emerald-200 bg-emerald-50"
                              : "border-slate-100 bg-slate-50"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-slate-900">{prompt.name}</p>
                              <p className="mt-1 text-xs text-slate-500 line-clamp-2 font-mono">
                                {prompt.content}
                              </p>
                              <p className="mt-1 text-xs text-slate-400">
                                {formatDate(prompt.updatedAt)}
                              </p>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <ActivatePromptButton
                                id={prompt.id}
                                type={prompt.type}
                                isActive={prompt.isActive}
                              />
                              <PromptVersionHistoryDialog promptId={prompt.id} promptName={prompt.name} />
                              <PromptDialog prompt={prompt} mode="edit" />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
