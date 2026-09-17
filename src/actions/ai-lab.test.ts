// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestOrg, createTestUser, fakeSession, cleanupOrg } from "@/test/helpers";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const authMock = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => authMock() }));

const runAiLabInferenceMock = vi.fn();
vi.mock("@/lib/ai-lab", () => ({ runAiLabInference: (...args: unknown[]) => runAiLabInferenceMock(...args) }));

const {
  createSandboxSession, listSandboxSessions, getSandboxSession, deleteSandboxSession, sendSandboxMessage,
  createTestCase, listTestCases, runTestCase, gradeTestCaseResult, deleteTestCase,
  createExperiment, runExperimentSample, judgeExperimentSample, completeExperiment, listExperiments,
} = await import("./ai-lab");

async function createPromptWithVersion(orgId: string, type: "SYSTEM" | "FAQ", content: string) {
  return prisma.prompt.create({
    data: {
      organizationId: orgId,
      name: `${type} test prompt`,
      type,
      content,
      versions: { create: { version: 1, content, isLatest: true } },
    },
    include: { versions: true },
  });
}

describe("ai-lab actions (Fase 7)", () => {
  let org: { id: string };
  let owner: { id: string };
  let viewer: { id: string };

  beforeAll(async () => {
    org = await createTestOrg("AI Lab Test Org");
    owner = await createTestUser(org.id, "OWNER", "ai-lab-owner");
    viewer = await createTestUser(org.id, "VIEWER", "ai-lab-viewer");
  });

  beforeEach(() => {
    runAiLabInferenceMock.mockReset();
    runAiLabInferenceMock.mockResolvedValue({ reply: "Respuesta de prueba", knowledgeBaseContext: [], latencyMs: 42 });
  });

  afterAll(async () => {
    await cleanupOrg(org.id);
  });

  it("rejects a VIEWER (no prompts:manage) from every AI Lab action", async () => {
    authMock.mockResolvedValue(fakeSession({ id: viewer.id, role: "VIEWER", organizationId: org.id }));
    await expect(createSandboxSession({})).rejects.toThrow(/permisos/i);
  });

  describe("sandbox sessions", () => {
    it("creates, lists, fetches, sends a message to, and deletes a sandbox session", async () => {
      authMock.mockResolvedValue(fakeSession({ id: owner.id, role: "OWNER", organizationId: org.id }));

      const created = await createSandboxSession({ name: "Sesión E2E" });
      expect(created.success).toBe(true);

      const list = await listSandboxSessions();
      expect(list.some((s) => s.id === created.sessionId)).toBe(true);

      const sent = await sendSandboxMessage(created.sessionId, "Hola, ¿tienen citas disponibles?");
      if (!sent.success) throw new Error("expected success");
      expect(sent.message.role).toBe("ASSISTANT");
      expect(sent.message.content).toBe("Respuesta de prueba");
      expect(sent.message.latencyMs).toBe(42);

      const detail = await getSandboxSession(created.sessionId);
      expect(detail.messages).toHaveLength(2);
      expect(detail.messages[0].role).toBe("USER");
      expect(detail.messages[1].role).toBe("ASSISTANT");

      await deleteSandboxSession(created.sessionId);
      await expect(getSandboxSession(created.sessionId)).rejects.toThrow(/no encontrada/i);
    });

    it("persists the user's message even when n8n inference fails, without a dangling assistant reply", async () => {
      authMock.mockResolvedValue(fakeSession({ id: owner.id, role: "OWNER", organizationId: org.id }));
      runAiLabInferenceMock.mockRejectedValueOnce(new Error("n8n no configurado"));

      const created = await createSandboxSession({});
      // Returned as data, not thrown — Next.js redacts thrown Server Action
      // error messages in production builds, so this specific, actionable
      // failure has to travel back as a value for the toast to show it.
      const outcome = await sendSandboxMessage(created.sessionId, "mensaje de prueba");
      expect(outcome).toMatchObject({ success: false, error: expect.stringMatching(/n8n no configurado/) });

      const detail = await getSandboxSession(created.sessionId);
      expect(detail.messages).toHaveLength(1);
      expect(detail.messages[0].role).toBe("USER");
    });

    it("rejects operating on a session from another organization", async () => {
      const otherOrg = await createTestOrg("AI Lab Other Org");
      authMock.mockResolvedValue(fakeSession({ id: owner.id, role: "OWNER", organizationId: otherOrg.id }));
      const otherSession = await createSandboxSession({});

      authMock.mockResolvedValue(fakeSession({ id: owner.id, role: "OWNER", organizationId: org.id }));
      await expect(getSandboxSession(otherSession.sessionId)).rejects.toThrow(/no encontrada/i);

      await cleanupOrg(otherOrg.id);
    });
  });

  describe("test cases", () => {
    it("creates a test case, runs it against a prompt version, and grades the result", async () => {
      authMock.mockResolvedValue(fakeSession({ id: owner.id, role: "OWNER", organizationId: org.id }));
      const prompt = await createPromptWithVersion(org.id, "FAQ", "Contenido FAQ v1");

      const created = await createTestCase({
        promptType: "FAQ", name: "Pregunta de horario", userMessage: "¿Cuál es su horario?",
      });

      const ran = await runTestCase(created.testCaseId, prompt.versions[0].id);
      if (!ran.success) throw new Error("expected success");
      expect(ran.result.reply).toBe("Respuesta de prueba");
      expect(runAiLabInferenceMock).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: org.id, promptType: "FAQ", promptContent: "Contenido FAQ v1" })
      );

      await gradeTestCaseResult(ran.result.id, true);
      const list = await listTestCases("FAQ");
      const found = list.find((tc) => tc.id === created.testCaseId)!;
      expect(found.results[0].passed).toBe(true);

      await deleteTestCase(created.testCaseId);
      expect(await listTestCases("FAQ")).not.toContainEqual(expect.objectContaining({ id: created.testCaseId }));
    });

    it("rejects running a test case against a version of a different prompt type", async () => {
      authMock.mockResolvedValue(fakeSession({ id: owner.id, role: "OWNER", organizationId: org.id }));
      const systemPrompt = await createPromptWithVersion(org.id, "SYSTEM", "Contenido sistema v1");
      const created = await createTestCase({ promptType: "FAQ", name: "Otro tipo", userMessage: "¿Hola?" });

      await expect(runTestCase(created.testCaseId, systemPrompt.versions[0].id)).rejects.toThrow(/no encontrada/i);
    });

    it("returns a structured error (not a thrown exception) when n8n inference fails", async () => {
      authMock.mockResolvedValue(fakeSession({ id: owner.id, role: "OWNER", organizationId: org.id }));
      const prompt = await createPromptWithVersion(org.id, "FAQ", "Contenido FAQ v2");
      const created = await createTestCase({ promptType: "FAQ", name: "Caso con fallo", userMessage: "¿Hola?" });

      runAiLabInferenceMock.mockRejectedValueOnce(new Error("n8n no configurado"));
      const outcome = await runTestCase(created.testCaseId, prompt.versions[0].id);
      expect(outcome).toMatchObject({ success: false, error: expect.stringMatching(/n8n no configurado/) });
    });
  });

  describe("A/B experiments", () => {
    it("creates an experiment, runs a sample against both variants, judges it, and completes the experiment", async () => {
      authMock.mockResolvedValue(fakeSession({ id: owner.id, role: "OWNER", organizationId: org.id }));
      const promptA = await createPromptWithVersion(org.id, "FAQ", "Saludo A");
      const promptB = await createPromptWithVersion(org.id, "FAQ", "Saludo B");

      runAiLabInferenceMock
        .mockResolvedValueOnce({ reply: "Respuesta variante A", knowledgeBaseContext: [], latencyMs: 10 })
        .mockResolvedValueOnce({ reply: "Respuesta variante B", knowledgeBaseContext: [], latencyMs: 12 });

      const experiment = await createExperiment({
        promptType: "FAQ", name: "Comparar tono", variantAId: promptA.versions[0].id, variantBId: promptB.versions[0].id,
      });

      const sampleOutcome = await runExperimentSample(experiment.experimentId, "¿Cuánto cuesta la consulta?");
      if (!sampleOutcome.success) throw new Error("expected success");
      const { sample } = sampleOutcome;
      expect(sample.replyA).toBe("Respuesta variante A");
      expect(sample.replyB).toBe("Respuesta variante B");

      await judgeExperimentSample(sample.id, "A");
      await completeExperiment(experiment.experimentId, "A");

      const list = await listExperiments();
      const found = list.find((e) => e.id === experiment.experimentId)!;
      expect(found.status).toBe("COMPLETED");
      expect(found.winnerVariant).toBe("A");
      expect(found.samples[0].preferred).toBe("A");
    });

    it("rejects creating an experiment with the same version for both variants", async () => {
      authMock.mockResolvedValue(fakeSession({ id: owner.id, role: "OWNER", organizationId: org.id }));
      const prompt = await createPromptWithVersion(org.id, "FAQ", "Único contenido");

      await expect(
        createExperiment({
          promptType: "FAQ", name: "Inválido", variantAId: prompt.versions[0].id, variantBId: prompt.versions[0].id,
        })
      ).rejects.toThrow(/distintas/);
    });
  });
});
