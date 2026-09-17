// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { prisma } from "./prisma";
import { createTestOrg, cleanupOrg } from "@/test/helpers";

const triggerN8nWorkflowSyncMock = vi.fn();
vi.mock("./n8n", () => ({ triggerN8nWorkflowSync: (...args: unknown[]) => triggerN8nWorkflowSyncMock(...args) }));

const { matchKnowledgeBaseContext, runAiLabInference } = await import("./ai-lab");

describe("matchKnowledgeBaseContext", () => {
  let org: { id: string };

  beforeAll(async () => {
    org = await createTestOrg("AI Lab KB Match Org");
    await prisma.knowledgeBase.createMany({
      data: [
        { organizationId: org.id, title: "Horario de laboratorio", content: "Abrimos de 7am a 5pm", category: "servicios", isActive: true },
        { organizationId: org.id, title: "Precios de consulta", content: "La consulta general cuesta $500", category: "precios", isActive: true },
        { organizationId: org.id, title: "Artículo inactivo", content: "No debería aparecer nunca", category: "servicios", isActive: false },
      ],
    });
  });

  afterAll(async () => {
    await cleanupOrg(org.id);
  });

  it("matches articles whose title/content contains a word from the user message", async () => {
    const result = await matchKnowledgeBaseContext(org.id, "¿Cuál es el horario del laboratorio?");
    expect(result.map((a) => a.title)).toContain("Horario de laboratorio");
    expect(result.every((a) => a.title !== "Artículo inactivo")).toBe(true);
  });

  it("falls back to the most recently updated active articles when nothing matches", async () => {
    const result = await matchKnowledgeBaseContext(org.id, "xyz completamente distinto");
    expect(result.length).toBeGreaterThan(0);
    expect(result.every((a) => a.title !== "Artículo inactivo")).toBe(true);
  });
});

describe("runAiLabInference", () => {
  let org: { id: string };

  beforeAll(async () => {
    org = await createTestOrg("AI Lab Inference Org");
  });

  beforeEach(() => triggerN8nWorkflowSyncMock.mockReset());

  afterAll(async () => {
    await cleanupOrg(org.id);
  });

  it("returns the reply and knowledgeBaseContext n8n echoes back on success", async () => {
    triggerN8nWorkflowSyncMock.mockResolvedValue({ success: true, reply: "¡Hola!", knowledgeBaseContext: ["kb1"] });

    const result = await runAiLabInference({
      organizationId: org.id, promptType: "SYSTEM", promptContent: "Eres un asistente", userMessage: "Hola",
    });

    expect(result.reply).toBe("¡Hola!");
    expect(result.knowledgeBaseContext).toEqual(["kb1"]);
    expect(triggerN8nWorkflowSyncMock).toHaveBeenCalledWith(
      "ai-lab-test",
      expect.objectContaining({ organizationId: org.id, event: "ai_lab.test_message" })
    );
  });

  it("throws a clear, actionable error instead of returning mock text when n8n isn't configured", async () => {
    triggerN8nWorkflowSyncMock.mockResolvedValue({ success: false, error: "n8n returned 404" });

    await expect(
      runAiLabInference({ organizationId: org.id, promptType: "SYSTEM", promptContent: "Eres un asistente", userMessage: "Hola" })
    ).rejects.toThrow(/ai-lab-test/);
  });
});
