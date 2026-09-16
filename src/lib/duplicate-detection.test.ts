// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestOrg, cleanupOrg } from "@/test/helpers";
import { findPotentialDuplicateLeads } from "./duplicate-detection";

describe("findPotentialDuplicateLeads", () => {
  let org: { id: string };
  let orgB: { id: string };

  beforeAll(async () => {
    org = await createTestOrg("Dup Detection Org");
    orgB = await createTestOrg("Dup Detection Org B");
  });

  afterAll(async () => {
    await cleanupOrg(org.id);
    await cleanupOrg(orgB.id);
  });

  it("returns [] when neither email nor phone is provided", async () => {
    const result = await findPotentialDuplicateLeads(org.id, {});
    expect(result).toEqual([]);
  });

  it("matches phones ignoring formatting characters", async () => {
    const lead = await prisma.lead.create({ data: { organizationId: org.id, name: "Phone Lead", phone: "(555) 123-4567" } });
    const result = await findPotentialDuplicateLeads(org.id, { phone: "5551234567" });
    expect(result.map((l) => l.id)).toContain(lead.id);
  });

  it("matches emails ignoring case and surrounding whitespace", async () => {
    const lead = await prisma.lead.create({ data: { organizationId: org.id, name: "Email Lead", email: "Someone@Example.com" } });
    const result = await findPotentialDuplicateLeads(org.id, { email: "  someone@example.com " });
    expect(result.map((l) => l.id)).toContain(lead.id);
  });

  it("excludes the given leadId from results", async () => {
    const lead = await prisma.lead.create({ data: { organizationId: org.id, name: "Self", phone: "555-0001" } });
    const result = await findPotentialDuplicateLeads(org.id, { phone: "555-0001" }, lead.id);
    expect(result.map((l) => l.id)).not.toContain(lead.id);
  });

  it("ignores soft-deleted leads", async () => {
    const lead = await prisma.lead.create({
      data: { organizationId: org.id, name: "Deleted", phone: "555-0002", deletedAt: new Date() },
    });
    const result = await findPotentialDuplicateLeads(org.id, { phone: "555-0002" });
    expect(result.map((l) => l.id)).not.toContain(lead.id);
  });

  it("never matches leads from another organization", async () => {
    await prisma.lead.create({ data: { organizationId: orgB.id, name: "Other Org Lead", phone: "555-0003" } });
    const result = await findPotentialDuplicateLeads(org.id, { phone: "555-0003" });
    expect(result).toEqual([]);
  });
});
