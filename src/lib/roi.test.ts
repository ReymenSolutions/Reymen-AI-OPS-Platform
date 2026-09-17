// @vitest-environment node
import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestOrg, createTestPipelineStages, cleanupOrg } from "@/test/helpers";
import { getRoiData } from "./roi";

describe("getRoiData", () => {
  let org: { id: string } | undefined;

  afterEach(async () => {
    if (org) await cleanupOrg(org.id);
    org = undefined;
  });

  it("reports no won deals when the org has none", async () => {
    org = await createTestOrg("Roi No Deals Org");
    const data = await getRoiData(org.id, "starter");
    expect(data.hasWonDeals).toBe(false);
    expect(data.totalWonOpportunities).toBe(0);
    expect(data.totalRevenue).toBe(0);
    expect(data.avgDealValue).toBe(0);
  });

  it("only counts opportunities sitting in a won pipeline stage", async () => {
    org = await createTestOrg("Roi Won Only Org");
    const stages = await createTestPipelineStages(org.id);
    const wonStage = stages.find((s) => s.isWon)!;
    const openStage = stages.find((s) => s.order === 0)!;
    const lead = await prisma.lead.create({ data: { organizationId: org.id, name: "Roi Lead" } });

    await prisma.opportunity.create({
      data: { organizationId: org.id, leadId: lead.id, pipelineStageId: wonStage.id, title: "Won Deal", amount: 1000, closedAt: new Date() },
    });
    await prisma.opportunity.create({
      data: { organizationId: org.id, leadId: lead.id, pipelineStageId: openStage.id, title: "Open Deal", amount: 5000 },
    });

    const data = await getRoiData(org.id, "starter");
    expect(data.hasWonDeals).toBe(true);
    expect(data.totalWonOpportunities).toBe(1);
    expect(data.totalRevenue).toBe(1000);
    expect(data.avgDealValue).toBe(1000);
  });

  it("excludes won opportunities without an amount set", async () => {
    org = await createTestOrg("Roi No Amount Org");
    const stages = await createTestPipelineStages(org.id);
    const wonStage = stages.find((s) => s.isWon)!;
    const lead = await prisma.lead.create({ data: { organizationId: org.id, name: "Roi Lead" } });

    await prisma.opportunity.create({
      data: { organizationId: org.id, leadId: lead.id, pipelineStageId: wonStage.id, title: "No amount", closedAt: new Date() },
    });

    const data = await getRoiData(org.id, "starter");
    expect(data.hasWonDeals).toBe(false);
    expect(data.totalWonOpportunities).toBe(0);
  });

  it("only counts closedAt within the last 30 days toward the last30 figures", async () => {
    org = await createTestOrg("Roi Last30 Org");
    const stages = await createTestPipelineStages(org.id);
    const wonStage = stages.find((s) => s.isWon)!;
    const lead = await prisma.lead.create({ data: { organizationId: org.id, name: "Roi Lead" } });

    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

    await prisma.opportunity.create({
      data: { organizationId: org.id, leadId: lead.id, pipelineStageId: wonStage.id, title: "Recent Win", amount: 2000, closedAt: new Date() },
    });
    await prisma.opportunity.create({
      data: { organizationId: org.id, leadId: lead.id, pipelineStageId: wonStage.id, title: "Old Win", amount: 8000, closedAt: sixtyDaysAgo },
    });

    const data = await getRoiData(org.id, "starter");
    expect(data.totalWonOpportunities).toBe(2);
    expect(data.totalRevenue).toBe(10000);
    expect(data.last30WonOpportunities).toBe(1);
    expect(data.last30Revenue).toBe(2000);
  });

  it("uses the real plan cost and computes ROI off last-30-days revenue", async () => {
    org = await createTestOrg("Roi Plan Cost Org");
    const stages = await createTestPipelineStages(org.id);
    const wonStage = stages.find((s) => s.isWon)!;
    const lead = await prisma.lead.create({ data: { organizationId: org.id, name: "Roi Lead" } });

    await prisma.opportunity.create({
      data: { organizationId: org.id, leadId: lead.id, pipelineStageId: wonStage.id, title: "Win", amount: 1000, closedAt: new Date() },
    });

    const data = await getRoiData(org.id, "professional");
    expect(data.planCost).toBe(699);
    expect(data.roi).toBe(Math.round(((1000 - 699) / 699) * 100));
  });

  it("falls back to the starter price for an unknown plan value", async () => {
    org = await createTestOrg("Roi Unknown Plan Org");
    const data = await getRoiData(org.id, "not-a-real-plan");
    expect(data.planCost).toBe(299);
  });
});
