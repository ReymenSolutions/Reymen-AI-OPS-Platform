// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestOrg, createTestUser, fakeSession, cleanupOrg } from "@/test/helpers";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const authMock = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => authMock() }));

vi.mock("@/lib/email", () => ({ sendEmail: vi.fn().mockResolvedValue({ sent: true }) }));
const triggerN8nWorkflowMock = vi.fn().mockResolvedValue({ success: true });
vi.mock("@/lib/n8n", () => ({ triggerN8nWorkflow: (...args: unknown[]) => triggerN8nWorkflowMock(...args) }));

const { sendEmail } = await import("@/lib/email");
const {
  escalateConversation, resolveConversation, getOlderMessages,
  sendManualMessage, takeHumanControl, releaseToAI, assignConversation,
} = await import("./conversations");

describe("conversations actions", () => {
  let org: { id: string };
  let owner: { id: string };
  let admin: { id: string; email: string };

  beforeAll(async () => {
    org = await createTestOrg("Conversations Test Org");
    owner = await createTestUser(org.id, "OWNER", "conv-owner");
    admin = await createTestUser(null, "SUPER_ADMIN", "conv-admin");
  });

  beforeEach(() => {
    (sendEmail as ReturnType<typeof vi.fn>).mockClear();
    triggerN8nWorkflowMock.mockClear();
    triggerN8nWorkflowMock.mockResolvedValue({ success: true });
  });

  afterAll(async () => {
    await cleanupOrg(org.id);
    await prisma.user.delete({ where: { id: admin.id } });
  });

  it("escalates an open conversation and notifies admins by email", async () => {
    authMock.mockResolvedValue(fakeSession({ id: owner.id, role: "OWNER", organizationId: org.id }));

    const conv = await prisma.conversation.create({
      data: { organizationId: org.id, channel: "whatsapp", contactName: "Ana García" },
    });

    const result = await escalateConversation(conv.id);
    expect(result.success).toBe(true);

    const updated = await prisma.conversation.findUniqueOrThrow({ where: { id: conv.id } });
    expect(updated.status).toBe("ESCALATED");
    expect(updated.escalatedAt).not.toBeNull();

    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: admin.email,
        subject: expect.stringContaining("escalada"),
        html: expect.stringContaining("Ana García"),
      })
    );
  });

  it("rejects escalating a conversation that isn't OPEN", async () => {
    authMock.mockResolvedValue(fakeSession({ id: owner.id, role: "OWNER", organizationId: org.id }));
    const conv = await prisma.conversation.create({
      data: { organizationId: org.id, channel: "whatsapp", status: "RESOLVED" },
    });

    await expect(escalateConversation(conv.id)).rejects.toThrow(/abiertas/i);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("resolves a conversation without sending an admin notification", async () => {
    authMock.mockResolvedValue(fakeSession({ id: owner.id, role: "OWNER", organizationId: org.id }));
    const conv = await prisma.conversation.create({
      data: { organizationId: org.id, channel: "whatsapp", status: "ESCALATED" },
    });

    const result = await resolveConversation(conv.id);
    expect(result.success).toBe(true);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  describe("getOlderMessages", () => {
    it("returns the page of messages before the cursor, oldest of that page first", async () => {
      authMock.mockResolvedValue(fakeSession({ id: owner.id, role: "OWNER", organizationId: org.id }));
      const conv = await prisma.conversation.create({
        data: { organizationId: org.id, channel: "whatsapp" },
      });

      // Create 5 messages with distinct timestamps, oldest first.
      const created = [];
      for (let i = 0; i < 5; i++) {
        const msg = await prisma.message.create({
          data: {
            conversationId: conv.id,
            role: "USER",
            content: `msg ${i}`,
            createdAt: new Date(Date.now() + i * 1000),
          },
        });
        created.push(msg);
      }

      // Ask for messages older than the 4th message (index 3) — should return
      // indices 0-2, oldest first.
      const result = await getOlderMessages(conv.id, created[3].id);
      expect(result.messages.map((m) => m.content)).toEqual(["msg 0", "msg 1", "msg 2"]);
      expect(result.hasMore).toBe(false);
    });

    it("reports hasMore when there's a full extra page beyond what's returned", async () => {
      authMock.mockResolvedValue(fakeSession({ id: owner.id, role: "OWNER", organizationId: org.id }));
      const conv = await prisma.conversation.create({
        data: { organizationId: org.id, channel: "whatsapp" },
      });

      const created = [];
      // 52 messages: cursor at the last one, 51 older ones (one full page of 50 + 1 more)
      for (let i = 0; i < 52; i++) {
        const msg = await prisma.message.create({
          data: {
            conversationId: conv.id,
            role: "USER",
            content: `msg ${i}`,
            createdAt: new Date(Date.now() + i * 1000),
          },
        });
        created.push(msg);
      }

      const result = await getOlderMessages(conv.id, created[51].id);
      expect(result.messages).toHaveLength(50);
      expect(result.hasMore).toBe(true);
      // Oldest-first, and it's the 50 immediately preceding the cursor (indices 1-50).
      expect(result.messages[0].content).toBe("msg 1");
      expect(result.messages[49].content).toBe("msg 50");
    });

    it("rejects a request for a conversation belonging to another organization", async () => {
      const otherOrg = await createTestOrg("Other Org For Messages");
      const otherConv = await prisma.conversation.create({
        data: { organizationId: otherOrg.id, channel: "whatsapp" },
      });
      const otherMsg = await prisma.message.create({
        data: { conversationId: otherConv.id, role: "USER", content: "secret" },
      });

      authMock.mockResolvedValue(fakeSession({ id: owner.id, role: "OWNER", organizationId: org.id }));
      await expect(getOlderMessages(otherConv.id, otherMsg.id)).rejects.toThrow(/no encontrada/i);

      await cleanupOrg(otherOrg.id);
    });
  });

  describe("sendManualMessage", () => {
    it("creates an AGENT message, triggers the outbound n8n workflow, and takes control of the conversation", async () => {
      authMock.mockResolvedValue(fakeSession({ id: owner.id, role: "OWNER", organizationId: org.id }));
      const conv = await prisma.conversation.create({
        data: { organizationId: org.id, channel: "whatsapp", contactPhone: "+15551110000" },
      });

      const result = await sendManualMessage({ conversationId: conv.id, content: "Claro, ahí estaré" });
      expect(result.success).toBe(true);
      expect(result.delivered).toBe(true);
      expect(result.message.role).toBe("AGENT");

      const updated = await prisma.conversation.findUniqueOrThrow({ where: { id: conv.id } });
      expect(updated.aiHandled).toBe(false);
      expect(updated.assignedToId).toBe(owner.id);

      expect(triggerN8nWorkflowMock).toHaveBeenCalledWith(
        "whatsapp-outbound",
        expect.objectContaining({ event: "message.send", data: expect.objectContaining({ conversationId: conv.id }) })
      );
    });

    it("marks the message FAILED when the outbound trigger fails", async () => {
      triggerN8nWorkflowMock.mockResolvedValueOnce({ success: false, error: "n8n unreachable" });
      authMock.mockResolvedValue(fakeSession({ id: owner.id, role: "OWNER", organizationId: org.id }));
      const conv = await prisma.conversation.create({ data: { organizationId: org.id, channel: "whatsapp" } });

      const result = await sendManualMessage({ conversationId: conv.id, content: "hola" });
      expect(result.delivered).toBe(false);

      const msg = await prisma.message.findUniqueOrThrow({ where: { id: result.message.id } });
      expect(msg.deliveryStatus).toBe("FAILED");
    });

    it("rejects sending into a RESOLVED conversation", async () => {
      authMock.mockResolvedValue(fakeSession({ id: owner.id, role: "OWNER", organizationId: org.id }));
      const conv = await prisma.conversation.create({ data: { organizationId: org.id, channel: "whatsapp", status: "RESOLVED" } });

      await expect(sendManualMessage({ conversationId: conv.id, content: "hola" })).rejects.toThrow(/cerrada/);
    });

    it("rejects an empty message with no attachment", async () => {
      authMock.mockResolvedValue(fakeSession({ id: owner.id, role: "OWNER", organizationId: org.id }));
      const conv = await prisma.conversation.create({ data: { organizationId: org.id, channel: "whatsapp" } });

      await expect(sendManualMessage({ conversationId: conv.id, content: "   " })).rejects.toThrow(/vacío/);
    });

    it("a VIEWER cannot send a manual message", async () => {
      const viewer = await createTestUser(org.id, "VIEWER", "conv-viewer");
      authMock.mockResolvedValue(fakeSession({ id: viewer.id, role: "VIEWER", organizationId: org.id }));
      const conv = await prisma.conversation.create({ data: { organizationId: org.id, channel: "whatsapp" } });

      await expect(sendManualMessage({ conversationId: conv.id, content: "hola" })).rejects.toThrow();
    });
  });

  describe("takeHumanControl / releaseToAI", () => {
    it("takeHumanControl claims an unassigned conversation and turns off aiHandled", async () => {
      authMock.mockResolvedValue(fakeSession({ id: owner.id, role: "OWNER", organizationId: org.id }));
      const conv = await prisma.conversation.create({ data: { organizationId: org.id, channel: "whatsapp" } });

      await takeHumanControl(conv.id);

      const updated = await prisma.conversation.findUniqueOrThrow({ where: { id: conv.id } });
      expect(updated.aiHandled).toBe(false);
      expect(updated.assignedToId).toBe(owner.id);
    });

    it("an AGENT cannot take control of a conversation already assigned to someone else", async () => {
      const agentA = await createTestUser(org.id, "AGENT", "conv-agent-a");
      const agentB = await createTestUser(org.id, "AGENT", "conv-agent-b");
      const conv = await prisma.conversation.create({
        data: { organizationId: org.id, channel: "whatsapp", aiHandled: false, assignedToId: agentA.id },
      });

      authMock.mockResolvedValue(fakeSession({ id: agentB.id, role: "AGENT", organizationId: org.id }));
      await expect(takeHumanControl(conv.id)).rejects.toThrow(/otro agente/);
    });

    it("a MANAGER (with conversations:assign) can take over from another agent", async () => {
      const agentA = await createTestUser(org.id, "AGENT", "conv-agent-c");
      const manager = await createTestUser(org.id, "MANAGER", "conv-manager");
      const conv = await prisma.conversation.create({
        data: { organizationId: org.id, channel: "whatsapp", aiHandled: false, assignedToId: agentA.id },
      });

      authMock.mockResolvedValue(fakeSession({ id: manager.id, role: "MANAGER", organizationId: org.id }));
      await takeHumanControl(conv.id);

      const updated = await prisma.conversation.findUniqueOrThrow({ where: { id: conv.id } });
      expect(updated.assignedToId).toBe(manager.id);
    });

    it("releaseToAI turns aiHandled back on and clears the assignment", async () => {
      authMock.mockResolvedValue(fakeSession({ id: owner.id, role: "OWNER", organizationId: org.id }));
      const conv = await prisma.conversation.create({
        data: { organizationId: org.id, channel: "whatsapp", aiHandled: false, assignedToId: owner.id },
      });

      await releaseToAI(conv.id);

      const updated = await prisma.conversation.findUniqueOrThrow({ where: { id: conv.id } });
      expect(updated.aiHandled).toBe(true);
      expect(updated.assignedToId).toBeNull();
    });
  });

  describe("assignConversation", () => {
    it("a MANAGER can assign a conversation to any active teammate, which also turns off aiHandled", async () => {
      const manager = await createTestUser(org.id, "MANAGER", "conv-assign-manager");
      const agent = await createTestUser(org.id, "AGENT", "conv-assign-agent");
      const conv = await prisma.conversation.create({ data: { organizationId: org.id, channel: "whatsapp" } });

      authMock.mockResolvedValue(fakeSession({ id: manager.id, role: "MANAGER", organizationId: org.id }));
      await assignConversation(conv.id, agent.id);

      const updated = await prisma.conversation.findUniqueOrThrow({ where: { id: conv.id } });
      expect(updated.assignedToId).toBe(agent.id);
      expect(updated.aiHandled).toBe(false);
    });

    it("unassigning (userId=null) leaves aiHandled untouched", async () => {
      const manager = await createTestUser(org.id, "MANAGER", "conv-unassign-manager");
      const conv = await prisma.conversation.create({
        data: { organizationId: org.id, channel: "whatsapp", aiHandled: false, assignedToId: manager.id },
      });

      authMock.mockResolvedValue(fakeSession({ id: manager.id, role: "MANAGER", organizationId: org.id }));
      await assignConversation(conv.id, null);

      const updated = await prisma.conversation.findUniqueOrThrow({ where: { id: conv.id } });
      expect(updated.assignedToId).toBeNull();
      expect(updated.aiHandled).toBe(false);
    });

    it("an AGENT (no conversations:assign) cannot assign a conversation to someone else", async () => {
      const agent = await createTestUser(org.id, "AGENT", "conv-noassign-agent");
      const otherAgent = await createTestUser(org.id, "AGENT", "conv-noassign-target");
      const conv = await prisma.conversation.create({ data: { organizationId: org.id, channel: "whatsapp" } });

      authMock.mockResolvedValue(fakeSession({ id: agent.id, role: "AGENT", organizationId: org.id }));
      await expect(assignConversation(conv.id, otherAgent.id)).rejects.toThrow();
    });

    it("rejects assigning to a user outside the organization", async () => {
      const manager = await createTestUser(org.id, "MANAGER", "conv-assign-manager-2");
      const outsider = await createTestUser(null, "AGENT", "conv-assign-outsider");
      const conv = await prisma.conversation.create({ data: { organizationId: org.id, channel: "whatsapp" } });

      authMock.mockResolvedValue(fakeSession({ id: manager.id, role: "MANAGER", organizationId: org.id }));
      await expect(assignConversation(conv.id, outsider.id)).rejects.toThrow(/no encontrado/);

      await prisma.user.delete({ where: { id: outsider.id } });
    });
  });
});
