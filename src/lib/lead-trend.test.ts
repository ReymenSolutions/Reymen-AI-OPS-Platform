import { describe, it, expect } from "vitest";
import { buildLeadTrend } from "./lead-trend";

describe("buildLeadTrend", () => {
  it("returns one zero-filled bucket per day and counts leads into their day", () => {
    const today = new Date();
    const twoDaysAgo = new Date(today);
    twoDaysAgo.setDate(today.getDate() - 2);
    const longAgo = new Date(today);
    longAgo.setDate(today.getDate() - 90);

    const trend = buildLeadTrend([{ createdAt: today }, { createdAt: today }, { createdAt: twoDaysAgo }, { createdAt: longAgo }]);
    expect(trend).toHaveLength(30);
    expect(trend[29]).toEqual({ date: `${today.getMonth() + 1}/${today.getDate()}`, total: 2 });
    expect(trend[27].total).toBe(1);
    expect(trend.reduce((sum, d) => sum + d.total, 0)).toBe(3);
  });
});
