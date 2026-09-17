// @vitest-environment node
import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestOrg, createTestUser, cleanupOrg, generateWebhookSecret } from "@/test/helpers";
import { getOnboardingStatus } from "./onboarding";

describe("getOnboardingStatus", () => {
  let org: { id: string } | undefined;

  afterEach(async () => {
    if (org) await cleanupOrg(org.id);
    org = undefined;
  });

  it("includes only the steps for modules the org actually has enabled", async () => {
    org = await createTestOrg("Onboarding CRM-only Org");
    // createTestOrg grants CRM + AI_WHATSAPP + AUTOMATIONS by default — suspend two of them.
    await prisma.organizationModule.updateMany({
      where: { organizationId: org.id, module: { in: ["AI_WHATSAPP", "AUTOMATIONS"] } },
      data: { status: "SUSPENDED" },
    });

    const status = await getOnboardingStatus(org.id);
    const ids = status.steps.map((s) => s.id);
    expect(ids).toContain("first_lead");
    expect(ids).toContain("invite_team");
    expect(ids).not.toContain("whatsapp_assistant");
    expect(ids).not.toContain("first_automation");
  });

  it("includes every module's step for an org with all three enabled", async () => {
    org = await createTestOrg("Onboarding All Modules Org");
    const status = await getOnboardingStatus(org.id);
    expect(status.steps.map((s) => s.id).sort()).toEqual(
      ["first_automation", "first_lead", "invite_team", "whatsapp_assistant"].sort()
    );
    expect(status.totalCount).toBe(4);
  });

  it("marks each step completed based on real data, not just presence", async () => {
    org = await createTestOrg("Onboarding Completion Org");
    await createTestUser(org.id, "OWNER", "onboarding-owner");

    const before = await getOnboardingStatus(org.id);
    expect(before.completedCount).toBe(0);
    expect(before.allDone).toBe(false);

    await prisma.lead.create({ data: { organizationId: org.id, name: "First Lead" } });
    const afterLead = await getOnboardingStatus(org.id);
    expect(afterLead.steps.find((s) => s.id === "first_lead")?.completed).toBe(true);
    expect(afterLead.steps.find((s) => s.id === "whatsapp_assistant")?.completed).toBe(false);

    await prisma.whatsAppAssistant.create({
      data: { organizationId: org.id, greeting: "Hola", isActive: true },
    });
    const afterAssistant = await getOnboardingStatus(org.id);
    expect(afterAssistant.steps.find((s) => s.id === "whatsapp_assistant")?.completed).toBe(true);

    await prisma.automation.create({
      data: { organizationId: org.id, name: "First Automation", type: "custom", webhookSecret: generateWebhookSecret() },
    });
    const afterAutomation = await getOnboardingStatus(org.id);
    expect(afterAutomation.steps.find((s) => s.id === "first_automation")?.completed).toBe(true);

    await createTestUser(org.id, "AGENT", "onboarding-agent");
    const afterTeam = await getOnboardingStatus(org.id);
    expect(afterTeam.steps.find((s) => s.id === "invite_team")?.completed).toBe(true);
    expect(afterTeam.allDone).toBe(true);
  });

  it("an inactive WhatsApp assistant does not count as configured", async () => {
    org = await createTestOrg("Onboarding Inactive Assistant Org");
    await prisma.whatsAppAssistant.create({ data: { organizationId: org.id, greeting: "Hola", isActive: false } });

    const status = await getOnboardingStatus(org.id);
    expect(status.steps.find((s) => s.id === "whatsapp_assistant")?.completed).toBe(false);
  });

  it("an archived automation does not count as the org's first automation", async () => {
    org = await createTestOrg("Onboarding Archived Automation Org");
    await prisma.automation.create({
      data: { organizationId: org.id, name: "Archived", type: "custom", status: "ARCHIVED", webhookSecret: generateWebhookSecret() },
    });

    const status = await getOnboardingStatus(org.id);
    expect(status.steps.find((s) => s.id === "first_automation")?.completed).toBe(false);
  });

  it("CRITICAL: auto-completes the org once every applicable step is done, without a manual skip", async () => {
    org = await createTestOrg("Onboarding Auto Complete Org");
    await Promise.all([
      prisma.lead.create({ data: { organizationId: org.id, name: "Lead" } }),
      prisma.whatsAppAssistant.create({ data: { organizationId: org.id, greeting: "Hola", isActive: true } }),
      prisma.automation.create({
        data: { organizationId: org.id, name: "Auto", type: "custom", webhookSecret: generateWebhookSecret() },
      }),
      createTestUser(org.id, "OWNER", "onboarding-auto-owner"),
      createTestUser(org.id, "AGENT", "onboarding-auto-agent"),
    ]);

    const before = await prisma.organization.findUniqueOrThrow({ where: { id: org.id }, select: { onboardingCompletedAt: true } });
    expect(before.onboardingCompletedAt).toBeNull();

    const status = await getOnboardingStatus(org.id);
    expect(status.allDone).toBe(true);
    expect(status.onboardingCompletedAt).not.toBeNull();

    const after = await prisma.organization.findUniqueOrThrow({ where: { id: org.id }, select: { onboardingCompletedAt: true } });
    expect(after.onboardingCompletedAt).not.toBeNull();
  });

  it("does not auto-complete while any applicable step is still missing", async () => {
    org = await createTestOrg("Onboarding Not Auto Complete Org");
    await prisma.lead.create({ data: { organizationId: org.id, name: "Only Lead" } });

    const status = await getOnboardingStatus(org.id);
    expect(status.allDone).toBe(false);
    expect(status.onboardingCompletedAt).toBeNull();
  });
});
