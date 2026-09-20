"use server";

import { auth } from "@/lib/auth";
import { getSmartcardAdminClient } from "@/lib/smartcard-supabase";
import { resolveSmartcardMembership } from "@/lib/smartcard-company";

// Roles that can be assigned from this form — mirrors reymen-smartcard's
// apps/ops/app/settings/actions.ts on purpose: "owner" is excluded there
// too (v1: one owner per company, assigned by Reymen directly, not
// reassignable from this form).
const INVITABLE_ROLES = ["admin", "manager", "staff", "agent"];

/**
 * Ported from reymen-smartcard's apps/ops/app/settings/actions.ts
 * (inviteTeamMemberAction) — same three real steps (limit pre-check →
 * auth.admin.inviteUserByEmail → company_users insert with rollback on
 * failure), adapted to this app's action convention: throw Error(message)
 * on failure, return a plain object on success (see setOrganizationModule
 * in actions/admin/modules.ts for the pattern this follows), instead of
 * the original's redirect(`/settings?error=...`) + query-string dictionary
 * — this app already has its own error-toast convention, no reason to
 * introduce a second one just for this page.
 *
 * One known simplification vs. the original: reymen-smartcard maps
 * Supabase's raw invite error through a dedicated describeInviteError()
 * helper (apps/ops/lib/db-errors.ts) this platform doesn't have access to;
 * here it's a single substring check for the "already registered" case and
 * a generic message otherwise. Fine for now — if REYMEN wants the same
 * granularity here later, that helper is worth porting too.
 */
export async function inviteSmartcardTeamMember(
  email: string,
  roleCode: string
): Promise<{ success: true }> {
  const session = await auth();
  if (!session?.user.organizationId || !session.user.email) {
    throw new Error("Sesión inválida.");
  }

  const result = await resolveSmartcardMembership(session.user.organizationId, session.user.email);
  if (!result.ok) {
    throw new Error("No se pudo confirmar tu membresía en SmartCard. Recarga la página e intenta de nuevo.");
  }
  if (!["owner", "admin"].includes(result.membership.roleCode)) {
    throw new Error("No tienes permiso para hacer eso.");
  }
  const { membership } = result;

  const normalizedEmail = email.trim().toLowerCase();
  const normalizedRole = roleCode.trim();
  if (!normalizedEmail || !normalizedRole) throw new Error("El correo y el rol son obligatorios.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) throw new Error("Ese correo no parece válido.");
  if (!INVITABLE_ROLES.includes(normalizedRole)) throw new Error("Ese rol no es válido.");

  const supabase = getSmartcardAdminClient();
  if (!supabase) throw new Error("SmartCard aún no está configurado en este entorno.");

  // Same app-level pre-check as the original — the real limit is enforced
  // by Supabase's own check_limit()-backed RLS policy on company_users
  // insert; this only exists to surface a precise message before that.
  const [{ count: currentSeats }, { data: limitValue }] = await Promise.all([
    supabase
      .from("company_users")
      .select("id", { count: "exact", head: true })
      .eq("company_id", membership.companyId)
      .in("status", ["invited", "active"]),
    supabase.rpc("check_limit", { p_company_id: membership.companyId, p_limit_key: "max_team_members" }),
  ]);

  if (limitValue !== null && (currentSeats ?? 0) >= Number(limitValue)) {
    throw new Error("Llegaste al límite de integrantes de tu plan. Contacta a REYMEN para subir de plan.");
  }

  const { data: role } = await supabase.from("roles").select("id").eq("code", normalizedRole).maybeSingle();
  if (!role) throw new Error("Ese rol no es válido.");

  const opsUrl = process.env.SMARTCARD_OPS_URL;
  const { data, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(normalizedEmail, {
    redirectTo: opsUrl ? `${opsUrl}/auth/confirm` : undefined,
  });

  if (inviteError || !data?.user) {
    const alreadyRegistered = inviteError?.message?.toLowerCase().includes("already been registered");
    throw new Error(
      alreadyRegistered
        ? "Ya existe una cuenta con ese correo. Si necesitas reinvitarla, contacta a soporte de REYMEN."
        : "No se pudo enviar la invitación. Intenta de nuevo."
    );
  }

  const { error: membershipError } = await supabase.from("company_users").insert({
    company_id: membership.companyId,
    user_id: data.user.id,
    role_id: role.id,
    status: "invited",
  });

  if (membershipError) {
    console.error(
      "[smartcard/actions] company_users insert falló, revirtiendo auth.users huérfano:",
      membershipError.message
    );
    const { error: rollbackError } = await supabase.auth.admin.deleteUser(data.user.id);
    if (rollbackError) {
      console.error("[smartcard/actions] No se pudo revertir el usuario huérfano:", rollbackError.message);
    }
    throw new Error("No se pudo agregar a la company. Intenta de nuevo.");
  }

  return { success: true };
}
