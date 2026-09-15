// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestOrg, createTestUser, fakeSession, cleanupOrg } from "@/test/helpers";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const authMock = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => authMock() }));

const { createArticle, updateArticle } = await import("./knowledge-base");

describe("knowledge-base actions — mass assignment protection", () => {
  let orgA: { id: string };
  let orgB: { id: string };
  let owner: { id: string };

  beforeAll(async () => {
    orgA = await createTestOrg("KB Actions Org A");
    orgB = await createTestOrg("KB Actions Org B");
    owner = await createTestUser(orgA.id, "OWNER", "kb-owner");
  });

  afterAll(async () => {
    await cleanupOrg(orgA.id);
    await cleanupOrg(orgB.id);
  });

  it("CRITICAL: updateArticle ignores a forged organizationId in the payload", async () => {
    authMock.mockResolvedValue(fakeSession({ id: owner.id, role: "OWNER", organizationId: orgA.id }));

    await createArticle({ title: "My Article", content: "Some content" });
    const article = await prisma.knowledgeBase.findFirstOrThrow({
      where: { organizationId: orgA.id, title: "My Article" },
    });

    const forgedPayload = {
      title: "Still Mine",
      content: "Updated content",
      organizationId: orgB.id,
      isActive: false,
    } as unknown as Parameters<typeof updateArticle>[1];

    await updateArticle(article.id, forgedPayload);

    const updated = await prisma.knowledgeBase.findUniqueOrThrow({ where: { id: article.id } });
    expect(updated.organizationId).toBe(orgA.id);
    expect(updated.isActive).toBe(true); // untouched — not part of the validated schema
    expect(updated.title).toBe("Still Mine"); // legitimate field still updates
  });
});
