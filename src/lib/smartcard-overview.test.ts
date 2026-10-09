// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// Cliente falso: cada tabla responde con su conteo y registra los filtros.
const counts: Record<string, number> = { companies: 4, clients: 7, cards: 12, profiles: 5, events: 340 };
const seen: { table: string; filters: [string, string, unknown][] }[] = [];
let configured = true;

vi.mock("./smartcard-supabase", () => ({
  getSmartcardAdminClient: () =>
    configured
      ? {
          from(table: string) {
            const entry = { table, filters: [] as [string, string, unknown][] };
            seen.push(entry);
            const b: Record<string, unknown> = {};
            const chain = (op: string) => (col: string, v?: unknown) => (entry.filters.push([op, col, v]), b);
            b.select = () => b;
            b.is = chain("is");
            b.eq = chain("eq");
            b.gte = chain("gte");
            b.then = (ok: (v: unknown) => unknown) => Promise.resolve({ count: counts[table] ?? 0, error: null }).then(ok);
            return b;
          },
        }
      : null,
}));

const companies = vi.fn();
vi.mock("./smartcard-link", () => ({ listSmartcardCompanies: () => companies() }));

const { getSmartcardOverview } = await import("./smartcard-overview");

const row = (id: string, kind: "none" | "stale" | "client") => ({
  id,
  name: id,
  slug: id,
  link: kind === "stale" ? { kind, orgId: "gone" } : kind === "client" ? { kind, clientId: "o", clientName: "O" } : { kind },
  activeMembers: 0,
  cards: 0,
});

beforeEach(() => {
  seen.length = 0;
  configured = true;
  companies.mockResolvedValue([row("a", "client"), row("b", "none"), row("c", "stale"), row("d", "none")]);
});

describe("getSmartcardOverview", () => {
  it("counts each entity and splits the companies that need attention", async () => {
    const o = await getSmartcardOverview(new Date("2026-10-30T12:00:00Z"));
    expect(o).toMatchObject({ companies: 4, clients: 7, cards: 12, profiles: 5, events30d: 340 });
    expect(o!.unlinked.map((c) => c.id)).toEqual(["b", "d"]);
    expect(o!.stale.map((c) => c.id)).toEqual(["c"]);
  });

  it("ignores deleted rows and bot events, and only looks 30 days back", async () => {
    await getSmartcardOverview(new Date("2026-10-30T12:00:00Z"));
    for (const t of ["clients", "cards", "profiles"]) {
      expect(seen.find((s) => s.table === t)!.filters).toContainEqual(["is", "deleted_at", null]);
    }
    const events = seen.find((s) => s.table === "events")!.filters;
    expect(events).toContainEqual(["eq", "is_bot", false]);
    expect(events).toContainEqual(["gte", "occurred_at", "2026-09-30T12:00:00.000Z"]);
  });

  it("returns null without the Supabase env", async () => {
    configured = false;
    expect(await getSmartcardOverview()).toBeNull();
  });
});
