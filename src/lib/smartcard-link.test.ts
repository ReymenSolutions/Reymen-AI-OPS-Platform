// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// Cliente falso de Supabase: cada consulta queda registrada con su tabla,
// operación y filtros, y responde lo que diga `respond`.
interface Call {
  table: string;
  op: string;
  payload?: unknown;
  filters: [string, string, unknown][];
}
let calls: Call[] = [];
let respond: (call: Call) => { data?: unknown; error?: { message: string } | null } = () => ({ data: null });
const auth = {
  admin: {
    createUser: vi.fn(),
    listUsers: vi.fn(),
    getUserById: vi.fn(),
    deleteUser: vi.fn(async () => ({})),
  },
};

function query(table: string) {
  const call: Call = { table, op: "select", filters: [] };
  const builder: Record<string, unknown> = {};
  const chain = (fn: (...a: unknown[]) => void) => (...a: unknown[]) => (fn(...a), builder);
  builder.select = chain(() => {});
  builder.order = chain(() => {});
  builder.update = chain((p) => ((call.op = "update"), (call.payload = p)));
  builder.insert = chain((p) => ((call.op = "insert"), (call.payload = p)));
  builder.delete = chain(() => (call.op = "delete"));
  builder.eq = chain((c, v) => call.filters.push(["eq", c as string, v]));
  builder.is = chain((c, v) => call.filters.push(["is", c as string, v]));
  const finish = () => {
    calls.push(call);
    return Promise.resolve({ error: null, ...respond(call) });
  };
  builder.maybeSingle = finish;
  builder.then = (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) => finish().then(ok, ko);
  return builder;
}

let configured = true;
vi.mock("./smartcard-supabase", () => ({
  getSmartcardAdminClient: () => (configured ? { from: query, auth } : null),
}));

const { getSmartcardLinkState, linkSmartcardCompany, unlinkSmartcardCompany, addSmartcardMember, removeSmartcardMember } =
  await import("./smartcard-link");

const has = (c: Call, f: [string, string, unknown]) => c.filters.some((x) => x[0] === f[0] && x[1] === f[1] && x[2] === f[2]);

beforeEach(() => {
  calls = [];
  configured = true;
  respond = () => ({ data: null });
  vi.clearAllMocks();
});

describe("getSmartcardLinkState", () => {
  it("reports not_configured without the Supabase env", async () => {
    configured = false;
    expect(await getSmartcardLinkState("org1")).toEqual({ status: "not_configured" });
  });

  it("lists only free companies when the client isn't linked", async () => {
    respond = (c) => (c.filters.some((f) => f[0] === "is") ? { data: [{ id: "c2", name: "Villa", slug: "villa" }] } : { data: null });
    expect(await getSmartcardLinkState("org1")).toEqual({ status: "unlinked", candidates: [{ id: "c2", name: "Villa", slug: "villa" }] });
    expect(has(calls[1], ["is", "external_org_id", null])).toBe(true);
  });

  it("shows members with their email, role and status", async () => {
    respond = (c) => {
      if (c.table === "companies") return { data: { id: "c1", name: "Villa", slug: "villa" } };
      if (c.table === "company_users") return { data: [{ id: "m1", user_id: "u1", role_id: "r1", status: "active" }] };
      return { data: [{ id: "r1", code: "owner" }] };
    };
    auth.admin.getUserById.mockResolvedValue({ data: { user: { email: "Dueno@Villa.mx" } } });
    expect(await getSmartcardLinkState("org1")).toEqual({
      status: "linked",
      company: { id: "c1", name: "Villa", slug: "villa" },
      members: [{ id: "m1", email: "dueno@villa.mx", roleCode: "owner", status: "active" }],
    });
    expect(has(calls.find((c) => c.table === "company_users")!, ["eq", "company_id", "c1"])).toBe(true);
  });
});

describe("linkSmartcardCompany", () => {
  it("CRITICAL: only takes a company that is still free", async () => {
    respond = (c) => (c.op === "update" ? { data: { id: "c2", name: "Villa", slug: "villa" } } : { data: null });
    await linkSmartcardCompany("org1", "c2");
    const update = calls.find((c) => c.op === "update")!;
    expect(update.payload).toEqual({ external_org_id: "org1" });
    expect(has(update, ["eq", "id", "c2"])).toBe(true);
    expect(has(update, ["is", "external_org_id", null])).toBe(true);
  });

  it("fails when another client already took it", async () => {
    respond = () => ({ data: null });
    await expect(linkSmartcardCompany("org1", "c2")).rejects.toThrow(/otro cliente/);
  });

  it("refuses a second company for an already linked client", async () => {
    respond = (c) => (c.op === "select" ? { data: { id: "c1" } } : { data: null });
    await expect(linkSmartcardCompany("org1", "c2")).rejects.toThrow(/ya está vinculado/);
    expect(calls.some((c) => c.op === "update")).toBe(false);
  });
});

it("unlinkSmartcardCompany clears only this client's link", async () => {
  await unlinkSmartcardCompany("org1");
  expect(calls[0]).toMatchObject({ table: "companies", op: "update", payload: { external_org_id: null } });
  expect(has(calls[0], ["eq", "external_org_id", "org1"])).toBe(true);
});

describe("addSmartcardMember", () => {
  const linked = (c: Call) => {
    if (c.table === "companies") return { data: { id: "c1" } };
    if (c.table === "roles") return { data: { id: "r-owner" } };
    return { data: null };
  };

  it("creates the SmartCard user and an active membership", async () => {
    respond = linked;
    auth.admin.createUser.mockResolvedValue({ data: { user: { id: "u9" } }, error: null });
    expect(await addSmartcardMember("org1", " Dueno@Villa.mx ", "owner")).toBe("added");
    expect(auth.admin.createUser.mock.calls[0][0]).toMatchObject({ email: "dueno@villa.mx", email_confirm: true });
    expect(calls.find((c) => c.op === "insert")!.payload).toEqual({ company_id: "c1", user_id: "u9", role_id: "r-owner", status: "active" });
  });

  it("reuses an existing user and reactivates their membership", async () => {
    respond = (c) => (c.table === "company_users" && c.op === "select" ? { data: { id: "m1" } } : linked(c));
    auth.admin.createUser.mockResolvedValue({ data: { user: null }, error: { message: "User already registered" } });
    auth.admin.listUsers.mockResolvedValue({ data: { users: [{ id: "u1", email: "dueno@villa.mx" }] } });
    expect(await addSmartcardMember("org1", "dueno@villa.mx", "owner")).toBe("updated");
    const update = calls.find((c) => c.op === "update")!;
    expect(update.payload).toEqual({ role_id: "r-owner", status: "active" });
    expect(has(update, ["eq", "company_id", "c1"])).toBe(true);
    expect(calls.some((c) => c.op === "insert")).toBe(false);
  });

  it("rolls back a user it created when the membership insert fails", async () => {
    respond = (c) => (c.op === "insert" ? { error: { message: "limit" } } : linked(c));
    auth.admin.createUser.mockResolvedValue({ data: { user: { id: "u9" } }, error: null });
    await expect(addSmartcardMember("org1", "x@villa.mx", "staff")).rejects.toThrow(/límite/);
    expect(auth.admin.deleteUser).toHaveBeenCalledWith("u9");
  });

  it("requires the client to be linked first", async () => {
    await expect(addSmartcardMember("org1", "x@villa.mx", "staff")).rejects.toThrow(/Primero vincula/);
    expect(auth.admin.createUser).not.toHaveBeenCalled();
  });
});

describe("removeSmartcardMember", () => {
  it("CRITICAL: deletes only within the client's own company", async () => {
    respond = (c) => (c.op === "delete" ? { data: [{ id: "m1" }] } : { data: { id: "c1" } });
    await removeSmartcardMember("org1", "m1");
    const del = calls.find((c) => c.op === "delete")!;
    expect(has(del, ["eq", "id", "m1"])).toBe(true);
    expect(has(del, ["eq", "company_id", "c1"])).toBe(true);
  });

  it("fails when the member isn't in that company", async () => {
    respond = (c) => (c.op === "delete" ? { data: [] } : { data: { id: "c1" } });
    await expect(removeSmartcardMember("org1", "other")).rejects.toThrow(/ya no existe/);
  });
});
