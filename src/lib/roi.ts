import { prisma } from "./prisma";
import { PLAN_PRICES } from "./permissions";

export interface RoiData {
  hasWonDeals: boolean;
  totalWonOpportunities: number;
  totalRevenue: number;
  avgDealValue: number;
  last30WonOpportunities: number;
  last30Revenue: number;
  planCost: number;
  /** null when there's no plan cost to divide by (shouldn't happen in practice — every plan has a price). */
  roi: number | null;
}

/**
 * Real ROI, sourced from actual closed-won deals instead of a manual
 * "guess your average deal value" input. Revenue comes from Opportunity.amount
 * on opportunities sitting in a PipelineStage marked isWon — the same data
 * the sales pipeline itself considers a won deal, not a separate estimate.
 *
 * last30* mirrors the reports page's own 30-day window so the revenue figure
 * is comparable to a monthly subscription cost, rather than mixing an
 * all-time revenue sum against a single month of plan cost.
 */
export async function getRoiData(organizationId: string, plan: string): Promise<RoiData> {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const [totals, last30] = await Promise.all([
    prisma.opportunity.aggregate({
      where: { organizationId, amount: { not: null }, pipelineStage: { isWon: true } },
      _sum: { amount: true },
      _count: { id: true },
    }),
    prisma.opportunity.aggregate({
      where: {
        organizationId,
        amount: { not: null },
        pipelineStage: { isWon: true },
        closedAt: { gte: thirtyDaysAgo },
      },
      _sum: { amount: true },
      _count: { id: true },
    }),
  ]);

  const totalWonOpportunities = totals._count.id;
  const totalRevenue = totals._sum.amount ?? 0;
  const last30WonOpportunities = last30._count.id;
  const last30Revenue = last30._sum.amount ?? 0;
  const planCost = PLAN_PRICES[plan] ?? PLAN_PRICES.starter;

  return {
    hasWonDeals: totalWonOpportunities > 0,
    totalWonOpportunities,
    totalRevenue,
    avgDealValue: totalWonOpportunities > 0 ? totalRevenue / totalWonOpportunities : 0,
    last30WonOpportunities,
    last30Revenue,
    planCost,
    roi: planCost > 0 ? Math.round(((last30Revenue - planCost) / planCost) * 100) : null,
  };
}
