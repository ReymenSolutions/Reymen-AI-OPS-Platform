// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestOrg, createTestUser, fakeSession, cleanupOrg } from "@/test/helpers";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const authMock = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => authMock() }));

const { createNote, deleteNote } = await import("./notes");

describe("notes actions", () => {
  let org: { id: string };
  let author: { id: string };
  let otherAgent: { id: string };
  let manager: { id: string };
  let leadId: string;

  beforeAll(async () => {
    org = await createTestOrg("Notes Test Org");
    author = await createTestUser(org.id, "AGENT", "notes-author");
    otherAgent = await createTestUser(org.id, "AGENT", "notes-other-agent");
    manager = await createTestUser(org.id, "MANAGER", "notes-manager");
    const lead = await prisma.lead.create({ data: { organizationId: org.id, name: "Note Lead" } });
    leadId = lead.id;
  });

  afterAll(async () => {
    await cleanupOrg(org.id);
  });

  it("creates a note attributed to the caller", async () => {
    authMock.mockResolvedValue(fakeSession({ id: author.id, role: "AGENT", organizationId: org.id }));
    const result = await createNote({ leadId, content: "First contact made" });
    expect(result.success).toBe(true);

    const note = await prisma.note.findUniqueOrThrow({ where: { id: result.noteId } });
    expect(note.authorId).toBe(author.id);
    expect(note.leadId).toBe(leadId);
  });

  it("rejects a note for a lead in another organization", async () => {
    const orgB = await createTestOrg("Notes Org B");
    const leadB = await prisma.lead.create({ data: { organizationId: orgB.id, name: "Other Org Lead" } });
    authMock.mockResolvedValue(fakeSession({ id: author.id, role: "AGENT", organizationId: org.id }));

    await expect(createNote({ leadId: leadB.id, content: "Should fail" })).rejects.toThrow();
    await cleanupOrg(orgB.id);
  });

  it("lets the author delete their own note", async () => {
    authMock.mockResolvedValue(fakeSession({ id: author.id, role: "AGENT", organizationId: org.id }));
    const { noteId } = await createNote({ leadId, content: "To be deleted by author" });
    await deleteNote(noteId);
    const note = await prisma.note.findUnique({ where: { id: noteId } });
    expect(note).toBeNull();
  });

  it("blocks another AGENT (non-author) from deleting the note", async () => {
    authMock.mockResolvedValue(fakeSession({ id: author.id, role: "AGENT", organizationId: org.id }));
    const { noteId } = await createNote({ leadId, content: "Protected note" });

    authMock.mockResolvedValue(fakeSession({ id: otherAgent.id, role: "AGENT", organizationId: org.id }));
    await expect(deleteNote(noteId)).rejects.toThrow();

    const stillThere = await prisma.note.findUnique({ where: { id: noteId } });
    expect(stillThere).not.toBeNull();
  });

  it("lets a MANAGER delete another user's note", async () => {
    authMock.mockResolvedValue(fakeSession({ id: author.id, role: "AGENT", organizationId: org.id }));
    const { noteId } = await createNote({ leadId, content: "Manager can remove this" });

    authMock.mockResolvedValue(fakeSession({ id: manager.id, role: "MANAGER", organizationId: org.id }));
    await deleteNote(noteId);

    const stillThere = await prisma.note.findUnique({ where: { id: noteId } });
    expect(stillThere).toBeNull();
  });
});
