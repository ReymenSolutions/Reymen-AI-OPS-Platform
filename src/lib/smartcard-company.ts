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
 * Resuelve solo el companyId de SmartCard ligado a un Organization de la
 * plataforma (companies.external_org_id), sin el resto de la resolución de
 * membresía (rol, módulos, usuario) que hace resolveSmartcardMembership --
 * agregado 2026-09-21 para el widget "SmartCard Restaurante" del dashboard
 * de Food, que muestra métricas a nivel de negocio (no las de una persona
 * en particular) y no debería fallar solo porque el usuario que ve Food no
 * tiene, además, una cuenta de SmartCard vinculada por email.
 */
export async function getSmartcardCompanyIdForOrg(organizationId: string): Promise<string | null> {
  const supabase = getSmartcardAdminClient();
  if (!supabase) return null;

  const { data: company, error } = await supabase
    .from("companies")
    .select("id")
    .eq("external_org_id", organizationId)
    .maybeSingle();

  if (error) {
    console.error("[smartcard-company] Error buscando company (getSmartcardCompanyIdForOrg):", error.message);
    return null;
  }
  return company?.id ?? null;
}

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

// The real, human-facing labels for reymen-smartcard's event_type values —
// confirmed 2026-09-21 by sampling the live events table rather than
// guessing (its schema carries no label column). Every value seen appears
// here; an event_type added later falls back to its raw code in the UI
// (see CardStatsPanel) instead of silently disappearing from the totals.
export const EVENT_TYPE_LABELS_ES: Record<string, string> = {
  qr_scan: "Escaneos QR",
  profile_view: "Vistas de perfil",
  whatsapp_click: "Clicks a WhatsApp",
  call_click: "Clicks a llamar",
  email_click: "Clicks a correo",
  facebook_click: "Clicks a Facebook",
  instagram_click: "Clicks a Instagram",
  custom_link_click: "Clicks a links personalizados",
  save_contact: "Contactos guardados",
};

export interface CardStatsEntry {
  cardId: string;
  cardCode: string;
  status: string;
  destinationType: string;
  clientName: string;
  totalEvents: number;
  byType: Record<string, number>;
  lastActivityAt: string | null;
}

export interface CompanyCardStats {
  totalCards: number;
  totalEvents: number;
  byType: Record<string, number>;
  cards: CardStatsEntry[];
}

const EMPTY_STATS: CompanyCardStats = { totalCards: 0, totalEvents: 0, byType: {}, cards: [] };

/**
 * SmartCard's actual reason for existing (per the user, 2026-09-21) — how
 * each issued card is performing: scans, profile views, and clicks per
 * channel. reymen-smartcard's own dashboard never built this (its
 * app/dashboard/page.tsx literally says "llega en la Fase 2"), so there's
 * nothing to port — this queries the raw tables directly:
 * clients (company_id) -> cards (client_id) -> events (card_id), same
 * company_id -> clients chain company_modules/company_users already use.
 *
 * PostgREST has no GROUP BY, so the per-type/per-card breakdown is done in
 * application code over the raw event rows rather than in SQL. Capped at
 * 5000 events (ordered newest-first) as a sanity limit for this early
 * stage of the product — worth moving to a real aggregate (a view, or a
 * dedicated RPC like the existing check_limit/log_event ones) well before
 * any single company gets close to that many real events.
 *
 * is_bot rows are excluded — that flag exists in the schema specifically
 * to keep non-human traffic out of stats like these.
 */
export async function getCompanyCardStats(companyId: string): Promise<CompanyCardStats> {
  const supabase = getSmartcardAdminClient();
  if (!supabase) return EMPTY_STATS;

  const { data: clients, error: clientsError } = await supabase
    .from("clients")
    .select("id, name, business_name")
    .eq("company_id", companyId);
  if (clientsError) {
    console.error("[smartcard-company] Error listando clients:", clientsError.message);
    return EMPTY_STATS;
  }
  if (!clients?.length) return EMPTY_STATS;

  const clientIds = clients.map((c) => c.id);
  const clientNameById = new Map(clients.map((c) => [c.id, c.business_name || c.name]));

  const { data: cards, error: cardsError } = await supabase
    .from("cards")
    .select("id, card_code, status, destination_type, client_id")
    .in("client_id", clientIds)
    .is("deleted_at", null);
  if (cardsError) {
    console.error("[smartcard-company] Error listando cards:", cardsError.message);
    return EMPTY_STATS;
  }
  if (!cards?.length) return { ...EMPTY_STATS, totalCards: 0 };

  const cardIds = cards.map((c) => c.id);
  const { data: events, error: eventsError } = await supabase
    .from("events")
    .select("card_id, event_type, occurred_at")
    .in("card_id", cardIds)
    .eq("is_bot", false)
    .order("occurred_at", { ascending: false })
    .limit(5000);
  if (eventsError) {
    console.error("[smartcard-company] Error listando events:", eventsError.message);
    return { totalCards: cards.length, totalEvents: 0, byType: {}, cards: [] };
  }

  const byCard = new Map<string, { byType: Record<string, number>; total: number; lastActivityAt: string | null }>();
  const companyByType: Record<string, number> = {};
  let companyTotal = 0;

  for (const e of events ?? []) {
    companyByType[e.event_type] = (companyByType[e.event_type] ?? 0) + 1;
    companyTotal += 1;

    const entry = byCard.get(e.card_id) ?? { byType: {}, total: 0, lastActivityAt: null };
    entry.byType[e.event_type] = (entry.byType[e.event_type] ?? 0) + 1;
    entry.total += 1;
    // events is ordered newest-first, so the first row seen per card is its
    // most recent activity.
    if (!entry.lastActivityAt) entry.lastActivityAt = e.occurred_at;
    byCard.set(e.card_id, entry);
  }

  const cardStats: CardStatsEntry[] = cards.map((c) => {
    const stats = byCard.get(c.id) ?? { byType: {}, total: 0, lastActivityAt: null };
    return {
      cardId: c.id,
      cardCode: c.card_code,
      status: c.status,
      destinationType: c.destination_type,
      clientName: clientNameById.get(c.client_id) ?? "—",
      totalEvents: stats.total,
      byType: stats.byType,
      lastActivityAt: stats.lastActivityAt,
    };
  });
  cardStats.sort((a, b) => b.totalEvents - a.totalEvents);

  return {
    totalCards: cards.length,
    totalEvents: companyTotal,
    byType: companyByType,
    cards: cardStats,
  };
}
