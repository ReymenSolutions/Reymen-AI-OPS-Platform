import { getSmartcardAdminClient } from "./smartcard-supabase";

export type SmartcardModuleCode = "smartcard" | "realty" | "food" | "retail" | "care";

export interface SmartcardMembership {
  companyId: string;
  companyName: string;
  companySlug: string;
  userId: string;
  roleCode: string;
  modules: SmartcardModuleCode[];
  limits: Partial<Record<SmartcardModuleCode, Record<string, unknown>>>;
}

export type ResolveMembershipResult =
  | { ok: true; membership: SmartcardMembership }
  | { ok: false; reason: "not_configured" | "no_company" | "no_membership" | "query_failed" };

/**
 * Ported from reymen-smartcard's apps/ops/lib/current-company-user.ts +
 * packages/entitlements/src/index.ts (resolveEntitlements/hasModule) —
 * that package lives in a separate monorepo and isn't published, so it
 * can't be imported directly; this duplicates its query logic instead,
 * adapted for two real differences from the original:
 *
 *   1. No Supabase Auth session here. This platform authenticates via
 *      NextAuth — "who is the current person" comes from the NextAuth
 *      session's email, matched against reymen-smartcard's Supabase Auth
 *      users by email. Same technique reymen-smartcard's own
 *      apps/ops/app/api/sso/smartcard/route.ts already uses to confirm SSO
 *      membership (getUserById over each active member, compare emails) —
 *      ported here rather than invented fresh.
 *   2. This runs on the service-role admin client (smartcard-supabase.ts),
 *      not an RLS-scoped one, so every query below filters explicitly by
 *      companyId/userId/status instead of relying on RLS to scope it. Keep
 *      every explicit filter — there is no RLS net catching a mistake here.
 *
 * Company resolution itself (companies.external_org_id) is unchanged from
 * the SSO route's own lookup — same column, same admin-created link (see
 * REYMEN Admin → companies), just queried again here instead of once per
 * SSO hop.
 */
export async function resolveSmartcardMembership(
  organizationId: string,
  email: string
): Promise<ResolveMembershipResult> {
  const supabase = getSmartcardAdminClient();
  if (!supabase) return { ok: false, reason: "not_configured" };

  const { data: company, error: companyError } = await supabase
    .from("companies")
    .select("id, name, slug")
    .eq("external_org_id", organizationId)
    .maybeSingle();

  if (companyError) {
    console.error("[smartcard-company] Error buscando company:", companyError.message);
    return { ok: false, reason: "query_failed" };
  }
  if (!company) return { ok: false, reason: "no_company" };

  const { data: members, error: membersError } = await supabase
    .from("company_users")
    .select("user_id, role_id")
    .eq("company_id", company.id)
    .eq("status", "active");

  if (membersError) {
    console.error("[smartcard-company] Error listando company_users:", membersError.message);
    return { ok: false, reason: "query_failed" };
  }

  const targetEmail = email.toLowerCase();
  let matched: { userId: string; roleId: string } | null = null;

  for (const member of members ?? []) {
    const { data: userResponse } = await supabase.auth.admin.getUserById(member.user_id);
    if (userResponse?.user?.email?.toLowerCase() === targetEmail) {
      matched = { userId: member.user_id, roleId: member.role_id };
      break;
    }
  }

  if (!matched) return { ok: false, reason: "no_membership" };

  const [{ data: role }, { data: companyModules }] = await Promise.all([
    supabase.from("roles").select("code").eq("id", matched.roleId).maybeSingle(),
    supabase.from("company_modules").select("module_id, enabled, limits").eq("company_id", company.id),
  ]);

  const enabledModuleIds = (companyModules ?? []).filter((m) => m.enabled).map((m) => m.module_id);
  const { data: moduleRows } =
    enabledModuleIds.length > 0
      ? await supabase.from("modules").select("id, code").in("id", enabledModuleIds)
      : { data: [] as { id: string; code: string }[] };

  const moduleCodeById = new Map((moduleRows ?? []).map((m) => [m.id, m.code as SmartcardModuleCode]));
  const modules: SmartcardModuleCode[] = [];
  const limits: Partial<Record<SmartcardModuleCode, Record<string, unknown>>> = {};
  for (const row of companyModules ?? []) {
    if (!row.enabled) continue;
    const code = moduleCodeById.get(row.module_id);
    if (!code) continue;
    modules.push(code);
    limits[code] = (row.limits as Record<string, unknown>) ?? {};
  }

  return {
    ok: true,
    membership: {
      companyId: company.id,
      companyName: company.name,
      companySlug: company.slug,
      userId: matched.userId,
      roleCode: role?.code ?? "unknown",
      modules,
      limits,
    },
  };
}

export interface CompanyRosterEntry {
  id: string;
  userId: string;
  roleCode: string;
  status: string;
  isCurrentUser: boolean;
}

/**
 * Ported from apps/ops/app/settings/page.tsx's roster query. Same privacy
 * note as the original: any active member can see the FACT of every row
 * (role, status) — RLS there restricted `user_profiles` to your own row
 * only, so other members' emails were never shown, just "Integrante". We
 * don't query emails here at all for other members, matching that on
 * purpose rather than by accident.
 */
export async function getCompanyRoster(
  companyId: string,
  currentUserId: string
): Promise<CompanyRosterEntry[]> {
  const supabase = getSmartcardAdminClient();
  if (!supabase) return [];

  const [{ data: members }, { data: roles }] = await Promise.all([
    supabase
      .from("company_users")
      .select("id, user_id, role_id, status")
      .eq("company_id", companyId)
      .order("created_at", { ascending: true }),
    supabase.from("roles").select("id, code"),
  ]);

  const roleCodeById = new Map((roles ?? []).map((r) => [r.id, r.code as string]));

  return (members ?? []).map((m) => ({
    id: m.id,
    userId: m.user_id,
    roleCode: roleCodeById.get(m.role_id) ?? m.role_id,
    status: m.status,
    isCurrentUser: m.user_id === currentUserId,
  }));
}
