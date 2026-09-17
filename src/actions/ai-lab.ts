"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { assertModuleEnabled } from "@/lib/modules";
import { can } from "@/lib/permissions";
import { runAiLabInference } from "@/lib/ai-lab";
import type { PromptType, UserRole } from "@prisma/client";

async function requireAiLabAccess() {
  const session = await auth();
  if (!session?.user.organizationId) throw new Error("No autorizado");
  if (!can(session.user.role as UserRole, "prompts:manage")) throw new Error("Sin permisos");
  await assertModuleEnabled(session.user.organizationId, "AI_WHATSAPP");
  return session;
}

// Every reply generated here needs the assistant's overall identity
// (SYSTEM prompt) as context, even when the thing under test is a more
// specific prompt type (LEAD_QUALIFICATION, FAQ, ...) — same layering the
// real WhatsApp assistant uses.
async function getActiveSystemContent(organizationId: string): Promise<string | undefined> {
  const active = await prisma.prompt.findFirst({
    where: { organizationId, type: "SYSTEM", isActive: true },
    select: { content: true },
  });
  return active?.content;
}

// ─── Sandbox sessions ───────────────────────────────────────────────

const createSessionSchema = z.object({
  name: z.string().min(1).optional(),
  promptVersionId: z.string().optional(),
});

export async function createSandboxSession(data: z.infer<typeof createSessionSchema>) {
  const session = await requireAiLabAccess();
  const parsed = createSessionSchema.parse(data);

  if (parsed.promptVersionId) {
    const version = await prisma.promptVersion.findFirst({
      where: { id: parsed.promptVersionId, prompt: { organizationId: session.user.organizationId! } },
    });
    if (!version) throw new Error("Versión de prompt no encontrada");
  }

  const created = await prisma.aiSandboxSession.create({
    data: {
      organizationId: session.user.organizationId!,
      name: parsed.name ?? "Sesión de prueba",
      promptVersionId: parsed.promptVersionId,
      createdBy: session.user.id,
    },
  });

  revalidatePath("/portal/ai-lab");
  return { success: true, sessionId: created.id };
}

export async function listSandboxSessions() {
  const session = await requireAiLabAccess();
  return prisma.aiSandboxSession.findMany({
    where: { organizationId: session.user.organizationId! },
    include: { _count: { select: { messages: true } } },
    orderBy: { updatedAt: "desc" },
  });
}

export async function getSandboxSession(sessionId: string) {
  const session = await requireAiLabAccess();
  const sandboxSession = await prisma.aiSandboxSession.findFirst({
    where: { id: sessionId, organizationId: session.user.organizationId! },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
  if (!sandboxSession) throw new Error("Sesión no encontrada");
  return sandboxSession;
}

export async function deleteSandboxSession(sessionId: string) {
  const session = await requireAiLabAccess();
  const sandboxSession = await prisma.aiSandboxSession.findFirst({
    where: { id: sessionId, organizationId: session.user.organizationId! },
  });
  if (!sandboxSession) throw new Error("Sesión no encontrada");

  await prisma.aiSandboxSession.delete({ where: { id: sessionId } });
  revalidatePath("/portal/ai-lab");
  return { success: true };
}

export async function sendSandboxMessage(sessionId: string, content: string) {
  const session = await requireAiLabAccess();
  const orgId = session.user.organizationId!;

  if (!content.trim()) throw new Error("El mensaje no puede estar vacío");

  const sandboxSession = await prisma.aiSandboxSession.findFirst({
    where: { id: sessionId, organizationId: orgId },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
  if (!sandboxSession) throw new Error("Sesión no encontrada");

  let promptType: PromptType = "SYSTEM";
  let promptContent: string | undefined;

  if (sandboxSession.promptVersionId) {
    const version = await prisma.promptVersion.findFirst({
      where: { id: sandboxSession.promptVersionId, prompt: { organizationId: orgId } },
      include: { prompt: true },
    });
    if (version) {
      promptType = version.prompt.type;
      promptContent = version.content;
    }
  }

  const systemContent = await getActiveSystemContent(orgId);
  if (!promptContent) {
    promptContent = systemContent ?? "Eres un asistente virtual útil y amable.";
  }

  await prisma.aiSandboxMessage.create({
    data: { sessionId, role: "USER", content },
  });

  // Next.js redacts a thrown Error's message from Server Actions in
  // production builds (replaced with a generic digest, to avoid leaking
  // internal details by default) — but this specific failure ("n8n isn't
  // configured for this org yet") is exactly what the tester needs to see.
  // Returning it as data instead of throwing is what actually gets it to
  // the client's toast in production, not just in `next dev`.
  let result;
  try {
    result = await runAiLabInference({
      organizationId: orgId,
      promptType,
      promptContent,
      systemContent: promptType === "SYSTEM" ? undefined : systemContent,
      userMessage: content,
      conversationHistory: sandboxSession.messages.map((m) => ({
        role: m.role === "ASSISTANT" ? "ASSISTANT" : "USER",
        content: m.content,
      })),
    });
  } catch (error) {
    return { success: false as const, error: error instanceof Error ? error.message : "Error desconocido" };
  }

  const assistantMessage = await prisma.aiSandboxMessage.create({
    data: {
      sessionId,
      role: "ASSISTANT",
      content: result.reply,
      knowledgeBaseContext: result.knowledgeBaseContext,
      latencyMs: result.latencyMs,
    },
  });

  await prisma.aiSandboxSession.update({ where: { id: sessionId }, data: { updatedAt: new Date() } });

  revalidatePath("/portal/ai-lab");
  return { success: true as const, message: assistantMessage };
}

// ─── Saved test cases ───────────────────────────────────────────────

const testCaseSchema = z.object({
  promptType: z.enum(["SYSTEM", "GREETING", "LEAD_QUALIFICATION", "APPOINTMENT_BOOKING", "FAQ", "ESCALATION"]),
  name: z.string().min(1),
  userMessage: z.string().min(1),
  expectedNotes: z.string().optional(),
});

export async function createTestCase(data: z.infer<typeof testCaseSchema>) {
  const session = await requireAiLabAccess();
  const parsed = testCaseSchema.parse(data);

  const testCase = await prisma.promptTestCase.create({
    data: { ...parsed, organizationId: session.user.organizationId! },
  });

  revalidatePath("/portal/ai-lab");
  return { success: true, testCaseId: testCase.id };
}

export async function listTestCases(promptType?: PromptType) {
  const session = await requireAiLabAccess();
  return prisma.promptTestCase.findMany({
    where: { organizationId: session.user.organizationId!, ...(promptType ? { promptType } : {}) },
    include: { results: { orderBy: { createdAt: "desc" }, take: 5 } },
    orderBy: { createdAt: "desc" },
  });
}

export async function deleteTestCase(testCaseId: string) {
  const session = await requireAiLabAccess();
  const testCase = await prisma.promptTestCase.findFirst({
    where: { id: testCaseId, organizationId: session.user.organizationId! },
  });
  if (!testCase) throw new Error("Caso de prueba no encontrado");

  await prisma.promptTestCase.delete({ where: { id: testCaseId } });
  revalidatePath("/portal/ai-lab");
  return { success: true };
}

export async function runTestCase(testCaseId: string, promptVersionId: string) {
  const session = await requireAiLabAccess();
  const orgId = session.user.organizationId!;

  const testCase = await prisma.promptTestCase.findFirst({
    where: { id: testCaseId, organizationId: orgId },
  });
  if (!testCase) throw new Error("Caso de prueba no encontrado");

  const version = await prisma.promptVersion.findFirst({
    where: { id: promptVersionId, prompt: { organizationId: orgId, type: testCase.promptType } },
    include: { prompt: true },
  });
  if (!version) throw new Error("Versión de prompt no encontrada para este tipo de caso de prueba");

  const systemContent = await getActiveSystemContent(orgId);

  let result;
  try {
    result = await runAiLabInference({
      organizationId: orgId,
      promptType: testCase.promptType,
      promptContent: version.content,
      systemContent: testCase.promptType === "SYSTEM" ? undefined : systemContent,
      userMessage: testCase.userMessage,
    });
  } catch (error) {
    return { success: false as const, error: error instanceof Error ? error.message : "Error desconocido" };
  }

  const testResult = await prisma.promptTestCaseResult.create({
    data: {
      testCaseId,
      promptVersionId,
      reply: result.reply,
      knowledgeBaseContext: result.knowledgeBaseContext,
      latencyMs: result.latencyMs,
    },
  });

  revalidatePath("/portal/ai-lab");
  return { success: true as const, result: testResult };
}

export async function gradeTestCaseResult(resultId: string, passed: boolean) {
  const session = await requireAiLabAccess();

  const result = await prisma.promptTestCaseResult.findFirst({
    where: { id: resultId, testCase: { organizationId: session.user.organizationId! } },
  });
  if (!result) throw new Error("Resultado no encontrado");

  await prisma.promptTestCaseResult.update({
    where: { id: resultId },
    data: { passed, gradedBy: session.user.id },
  });

  revalidatePath("/portal/ai-lab");
  return { success: true };
}

// ─── A/B experiments ────────────────────────────────────────────────

const experimentSchema = z.object({
  promptType: z.enum(["SYSTEM", "GREETING", "LEAD_QUALIFICATION", "APPOINTMENT_BOOKING", "FAQ", "ESCALATION"]),
  name: z.string().min(1),
  variantAId: z.string(),
  variantBId: z.string(),
});

export async function createExperiment(data: z.infer<typeof experimentSchema>) {
  const session = await requireAiLabAccess();
  const orgId = session.user.organizationId!;
  const parsed = experimentSchema.parse(data);

  if (parsed.variantAId === parsed.variantBId) {
    throw new Error("Elige dos versiones distintas para comparar");
  }

  const [variantA, variantB] = await Promise.all([
    prisma.promptVersion.findFirst({
      where: { id: parsed.variantAId, prompt: { organizationId: orgId, type: parsed.promptType } },
    }),
    prisma.promptVersion.findFirst({
      where: { id: parsed.variantBId, prompt: { organizationId: orgId, type: parsed.promptType } },
    }),
  ]);
  if (!variantA || !variantB) throw new Error("Una de las versiones no existe para este tipo de prompt");

  const experiment = await prisma.promptExperiment.create({
    data: { ...parsed, organizationId: orgId },
  });

  revalidatePath("/portal/ai-lab");
  return { success: true, experimentId: experiment.id };
}

export async function listExperiments() {
  const session = await requireAiLabAccess();
  return prisma.promptExperiment.findMany({
    where: { organizationId: session.user.organizationId! },
    include: { variantA: true, variantB: true, samples: { orderBy: { createdAt: "desc" } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function runExperimentSample(experimentId: string, userMessage: string) {
  const session = await requireAiLabAccess();
  const orgId = session.user.organizationId!;

  const experiment = await prisma.promptExperiment.findFirst({
    where: { id: experimentId, organizationId: orgId },
    include: { variantA: true, variantB: true },
  });
  if (!experiment) throw new Error("Experimento no encontrado");
  if (experiment.status === "COMPLETED") throw new Error("Este experimento ya está cerrado");

  const systemContent = await getActiveSystemContent(orgId);
  const useSystemContext = experiment.promptType !== "SYSTEM";

  let resultA, resultB;
  try {
    [resultA, resultB] = await Promise.all([
      runAiLabInference({
        organizationId: orgId,
        promptType: experiment.promptType,
        promptContent: experiment.variantA.content,
        systemContent: useSystemContext ? systemContent : undefined,
        userMessage,
      }),
      runAiLabInference({
        organizationId: orgId,
        promptType: experiment.promptType,
        promptContent: experiment.variantB.content,
        systemContent: useSystemContext ? systemContent : undefined,
        userMessage,
      }),
    ]);
  } catch (error) {
    return { success: false as const, error: error instanceof Error ? error.message : "Error desconocido" };
  }

  const sample = await prisma.promptExperimentSample.create({
    data: {
      experimentId,
      userMessage,
      replyA: resultA.reply,
      replyB: resultB.reply,
    },
  });

  revalidatePath("/portal/ai-lab");
  return { success: true as const, sample };
}

export async function judgeExperimentSample(sampleId: string, preferred: "A" | "B" | "TIE") {
  const session = await requireAiLabAccess();

  const sample = await prisma.promptExperimentSample.findFirst({
    where: { id: sampleId, experiment: { organizationId: session.user.organizationId! } },
  });
  if (!sample) throw new Error("Muestra no encontrada");

  await prisma.promptExperimentSample.update({ where: { id: sampleId }, data: { preferred } });

  revalidatePath("/portal/ai-lab");
  return { success: true };
}

export async function completeExperiment(experimentId: string, winnerVariant: "A" | "B" | "TIE") {
  const session = await requireAiLabAccess();

  const experiment = await prisma.promptExperiment.findFirst({
    where: { id: experimentId, organizationId: session.user.organizationId! },
  });
  if (!experiment) throw new Error("Experimento no encontrado");

  await prisma.promptExperiment.update({
    where: { id: experimentId },
    data: { status: "COMPLETED", winnerVariant, completedAt: new Date() },
  });

  revalidatePath("/portal/ai-lab");
  return { success: true };
}
