// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestOrg, createTestUser, fakeSession, cleanupOrg } from "@/test/helpers";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const authMock = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => authMock() }));

vi.mock("@/lib/email", () => ({ sendEmail: vi.fn().mockResolvedValue({ sent: true }) }));
const { sendEmail } = await import("@/lib/email");
const { escalateConversation, resolveConversation, getOlderMessages } = await import("./conversations");

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
});
