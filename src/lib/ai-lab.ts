import { prisma } from "./prisma";
import { triggerN8nWorkflowSync } from "./n8n";
import type { PromptType } from "@prisma/client";

const KB_CONTEXT_LIMIT = 5;

export interface KnowledgeBaseContextArticle {
  id: string;
  title: string;
  content: string;
  category: string | null;
}

// Same idea as the /api/v1/knowledge-base substring search (§9 of the
// technical docs), reused here so the AI Lab sends the same kind of context
// n8n's real AI-reply workflow would pull for this org — no separate
// search implementation to keep in sync.
export async function matchKnowledgeBaseContext(
  organizationId: string,
  userMessage: string
): Promise<KnowledgeBaseContextArticle[]> {
  const words = userMessage
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter((w) => w.length >= 4);

  const matched = words.length
    ? await prisma.knowledgeBase.findMany({
        where: {
          organizationId,
          isActive: true,
          OR: words.flatMap((w) => [
            { title: { contains: w, mode: "insensitive" as const } },
            { content: { contains: w, mode: "insensitive" as const } },
          ]),
        },
        select: { id: true, title: true, content: true, category: true },
        orderBy: { updatedAt: "desc" },
        take: KB_CONTEXT_LIMIT,
      })
    : [];

  if (matched.length > 0) return matched;

  // No keyword hit: fall back to the most recently updated active
  // articles, same as an assistant with no specific match falling back to
  // general knowledge rather than nothing at all.
  return prisma.knowledgeBase.findMany({
    where: { organizationId, isActive: true },
    select: { id: true, title: true, content: true, category: true },
    orderBy: { updatedAt: "desc" },
    take: KB_CONTEXT_LIMIT,
  });
}

export interface AiLabInferenceInput {
  organizationId: string;
  promptType: PromptType;
  promptContent: string;
  systemContent?: string;
  userMessage: string;
  conversationHistory?: { role: "USER" | "ASSISTANT"; content: string }[];
}

export interface AiLabInferenceResult {
  reply: string;
  knowledgeBaseContext: string[];
  latencyMs: number;
}

const AI_LAB_WEBHOOK_PATH = "ai-lab-test";

// The one place the AI Lab (Fase 7) actually asks for a generated reply.
// Per the platform's n8n-invisibility / "n8n executes" rule, this never
// calls an LLM provider directly — it hands the org's own n8n instance
// everything needed (prompt content under test, matched KB articles,
// sandbox history, the new message) and waits synchronously for the real
// reply. If that org hasn't configured the `ai-lab-test` webhook in n8n
// yet, this throws a clear, actionable error instead of returning mock text.
export async function runAiLabInference(input: AiLabInferenceInput): Promise<AiLabInferenceResult> {
  const kbArticles = await matchKnowledgeBaseContext(input.organizationId, input.userMessage);
  const startedAt = Date.now();

  const result = await triggerN8nWorkflowSync(AI_LAB_WEBHOOK_PATH, {
    organizationId: input.organizationId,
    event: "ai_lab.test_message",
    data: {
      promptType: input.promptType,
      promptContent: input.promptContent,
      systemContent: input.systemContent ?? null,
      knowledgeBase: kbArticles,
      conversationHistory: input.conversationHistory ?? [],
      userMessage: input.userMessage,
    },
  });

  const latencyMs = Date.now() - startedAt;

  if (!result.success || !result.reply) {
    throw new Error(
      `El Laboratorio de IA no pudo generar una respuesta: ${result.error ?? "n8n no configurado"}. ` +
        `Configura el workflow de n8n en la ruta "${AI_LAB_WEBHOOK_PATH}" para esta organización.`
    );
  }

  return {
    reply: result.reply,
    knowledgeBaseContext: result.knowledgeBaseContext ?? kbArticles.map((a) => a.id),
    latencyMs,
  };
}
