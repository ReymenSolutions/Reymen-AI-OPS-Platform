// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestOrg, createTestUser, fakeSession, cleanupOrg } from "@/test/helpers";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const authMock = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => authMock() }));

const { createPrompt, updatePrompt } = await import("./prompts");

describe("prompts actions — mass assignment protection", () => {
  let orgA: { id: string };
  let orgB: { id: string };
  let owner: { id: string };

  beforeAll(async () => {
    orgA = await createTestOrg("Prompts Org A");
    orgB = await createTestOrg("Prompts Org B");
    owner = await createTestUser(orgA.id, "OWNER", "prompts-owner");
  });

  afterAll(async () => {
    await cleanupOrg(orgA.id);
    await cleanupOrg(orgB.id);
  });

  it("CRITICAL: updatePrompt ignores a forged organizationId in the payload, keeping the record in the caller's org", async () => {
    authMock.mockResolvedValue(fakeSession({ id: owner.id, role: "OWNER", organizationId: orgA.id }));

    await createPrompt({ name: "My Prompt", content: "Some prompt content here", type: "FAQ" });
    const prompt = await prisma.prompt.findFirstOrThrow({ where: { organizationId: orgA.id, name: "My Prompt" } });

    // Forged payload with extra fields not exposed by the UI/schema.
    const forgedPayload = {
      name: "Still Mine",
      content: "Updated content long enough",
      type: "FAQ",
      organizationId: orgB.id,
      isActive: true,
    } as unknown as Parameters<typeof updatePrompt>[1];

    await updatePrompt(prompt.id, forgedPayload);

    const updated = await prisma.prompt.findUniqueOrThrow({ where: { id: prompt.id } });
    expect(updated.organizationId).toBe(orgA.id);
    expect(updated.isActive).toBe(false); // untouched — not part of the validated schema
    expect(updated.name).toBe("Still Mine"); // legitimate field still updates
  });

  it("rejects invalid data via runtime validation (not just TypeScript types)", async () => {
    authMock.mockResolvedValue(fakeSession({ id: owner.id, role: "OWNER", organizationId: orgA.id }));
    await expect(
      createPrompt({ name: "", content: "short", type: "FAQ" } as unknown as Parameters<typeof createPrompt>[0])
    ).rejects.toThrow();
  });
});
