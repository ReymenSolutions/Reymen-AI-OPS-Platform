"use server";

import crypto from "node:crypto";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSmartcardAdminClient } from "@/lib/smartcard-supabase";
import { resolveSmartcardMembership } from "@/lib/smartcard-company";
import { inviteTeamMember } from "@/actions/team";

// Roles that can be assigned from this form — mirrors reymen-smartcard's
// apps/ops/app/settings/actions.ts on purpose: "owner" is excluded there
// too (v1: one owner per company, assigned by Reymen directly, not
// reassignable from this form).
const INVITABLE_ROLES = ["admin", "manager", "staff", "agent"];

// Maps a SmartCard-specific role (its own axis, stored only in
// reymen-smartcard's roles/company_users tables) onto this platform's own
// UserRole (governs portal-wide access via can() in permissions.ts). There's
// no 1:1 correspondence — SmartCard's "staff"/"agent" both become the
// portal's AGENT, "admin"/"manager" both become MANAGER. OWNER/ADMIN portal
// roles are never granted from here on purpose, matching inviteTeamMember's
// own MANAGER/AGENT/VIEWER-only self-service scope — real portal admins are
// set up by REYMEN directly, not through a team invite of any kind.
const SMARTCARD_ROLE_TO_USER_ROLE: Record<string, "MANAGER" | "AGENT"> = {
  admin: "MANAGER",
  manager: "MANAGER",
  staff: "AGENT",
  agent: "AGENT",
};

type InviteResult = { success: true } | { success: false; error: string };

/**
 * Rewritten 2026-09-20 after discovering reymen-smartcard's own invite flow
 * was never finished end-to-end: apps/ops/app/auth/confirm/route.ts sends an
 * invited user to /set-password, which doesn't exist in that app (confirmed
 * via that repo's own code comment — the route "nunca se construyó"). So
 * nobody who ever received a Supabase invite email there could actually set
 * a password and get promoted from company_users.status 'invited' to
 * 'active' — every invite dead-ended at /no-access. This predates this
 * integration; we didn't break it, but continuing to depend on it doesn't
 * make sense either, especially given the explicit ask to keep everything
 * in one app instead of bouncing between pages.
 *
 * New flow — no Supabase Auth email, no wait on ops.reymen.mx at all:
 *   1. A Supabase Auth user is created (or reused if one already exists for
 *      that email) via the admin API, with a random password nobody will
 *      ever use — it exists purely so company_users.user_id has something
 *      to reference. Nobody logs in through Supabase Auth for this.
 *   2. company_users is inserted with status 'active' immediately — there's
 *      no separate activation step left to wait on.
 *   3. The account the person actually logs into is an ordinary
 *      AI-Ops-Platform portal account: reuses inviteTeamMember()
 *      (src/actions/team.ts) as-is for a brand-new email — same
 *      inviter-sets-a-temporary-password UX and notification email as
 *      "Invitar usuario" in Configuración — or, if that email already
 *      belongs to a User in this same organization, just attaches SmartCard
 *      access to the account they already have.
 *
 * Explicit product decision (not a default): the portal account this
 * creates gets ordinary org-wide access per its UserRole (leads, pipeline,
 * conversations, etc.), same as any other team invite — there's no
 * SmartCard-only login today. See SMARTCARD_ROLE_TO_USER_ROLE above. One
 * real consequence of that choice: this now also counts against the org's
 * general "users" plan capacity (assertPlanCapacity inside inviteTeamMember),
 * on top of SmartCard's own separate max_team_members seat limit — an org
 * already at its general user cap can't add a SmartCard member either,
 * until its plan is upgraded or a seat is freed.
 *
 * Returns a result object instead of throwing (2026-09-20): Next.js
 * redacts a thrown Server Action error's message in production ("An error
 * occurred in the Server Components render..."), so the friendly Spanish
 * messages below never reached the client — every failure surfaced as a
 * generic crash instead of a toast. All internal validation still throws
 * (kept for readable early-return control flow); only the outermost catch
 * here converts that into { success: false, error }.
 */
export async function inviteSmartcardTeamMember(
  name: string,
  email: string,
  roleCode: string,
  password: string
): Promise<InviteResult> {
  try {
    await run(name, email, roleCode, password);
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo procesar la invitación. Intenta de nuevo.";
    if (!(err instanceof Error)) {
      console.error("[smartcard/actions] inviteSmartcardTeamMember falló con un valor no-Error:", err);
    }
    return { success: false, error: message };
  }
}

async function run(name: string, email: string, roleCode: string, password: string): Promise<void> {
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

  const normalizedName = name.trim();
  const normalizedEmail = email.trim().toLowerCase();
  const normalizedRole = roleCode.trim();
  if (normalizedName.length < 2) throw new Error("El nombre debe tener al menos 2 caracteres.");
  if (!normalizedEmail) throw new Error("El correo es obligatorio.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) throw new Error("Ese correo no parece válido.");
  if (!INVITABLE_ROLES.includes(normalizedRole)) throw new Error("Ese rol no es válido.");
  if (!password || password.length < 8) throw new Error("La contraseña temporal debe tener al menos 8 caracteres.");

  // Fail fast, before touching Supabase: does this email already belong to
  // a portal account, and if so, whose?
  const existingPortalUser = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (existingPortalUser && existingPortalUser.organizationId !== session.user.organizationId) {
    throw new Error("Ese correo ya pertenece a una cuenta de otra organización.");
  }

  const supabase = getSmartcardAdminClient();
  if (!supabase) throw new Error("SmartCard aún no está configurado en este entorno.");

  // Same app-level pre-check as before — the real limit is enforced by
  // Supabase's own check_limit()-backed policy on the company_users insert.
  const [{ count: currentSeats }, { data: limitValue }] = await Promise.all([
    supabase
      .from("company_users")
      .select("id", { count: "exact", head: true })
      .eq("company_id", membership.companyId)
      .in("status", ["invited", "active"]),
    supabase.rpc("check_limit", { p_company_id: membership.companyId, p_limit_key: "max_team_members" }),
  ]);

  if (limitValue !== null && (currentSeats ?? 0) >= Number(limitValue)) {
    throw new Error("Llegaste al límite de integrantes de tu plan de SmartCard. Contacta a REYMEN para subir de plan.");
  }

  const { data: role } = await supabase.from("roles").select("id").eq("code", normalizedRole).maybeSingle();
  if (!role) throw new Error("Ese rol no es válido.");

  // 1. Supabase Auth user: reuse if one already exists for this email (e.g.
  // added to SmartCard before, or belongs to another company too), otherwise
  // create one with a random password nobody will ever use.
  let supabaseUserId: string;
  let createdSupabaseUser = false;
  const { data: created, error: createError } = await supabase.auth.admin.createUser({
    email: normalizedEmail,
    password: crypto.randomBytes(24).toString("hex"),
    email_confirm: true,
  });

  if (created?.user) {
    supabaseUserId = created.user.id;
    createdSupabaseUser = true;
  } else if (createError?.message?.toLowerCase().includes("already")) {
    // Documented admin.listUsers() pagination — deliberately not a raw REST
    // call with an email query param, since that filter isn't part of the
    // supabase-js contract and isn't worth depending on here.
    let match: { id: string } | undefined;
    for (let page = 1; !match; page++) {
      const { data: listed, error: listError } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
      if (listError || !listed?.users?.length) break;
      match = listed.users.find((u) => u.email?.toLowerCase() === normalizedEmail);
      if (listed.users.length < 200) break;
    }
    if (!match) throw new Error("No se pudo procesar la invitación. Intenta de nuevo.");
    supabaseUserId = match.id;
  } else {
    throw new Error("No se pudo procesar la invitación. Intenta de nuevo.");
  }

  // 2. company_users, active immediately — no separate activation step left
  // to depend on.
  const { error: membershipError } = await supabase.from("company_users").insert({
    company_id: membership.companyId,
    user_id: supabaseUserId,
    role_id: role.id,
    status: "active",
  });

  if (membershipError) {
    console.error("[smartcard/actions] company_users insert falló:", membershipError.message);
    if (createdSupabaseUser) {
      await supabase.auth.admin
        .deleteUser(supabaseUserId)
        .catch((e) => console.error("[smartcard/actions] No se pudo revertir el usuario huérfano de Supabase:", e));
    }
    throw new Error("No se pudo agregar a la company. Intenta de nuevo.");
  }

  // 3. The real login: reuse the existing account if this email is already
  // part of this organization's team, otherwise create one through the
  // portal's own, already-working invite flow (same UX as "Invitar usuario"
  // in Configuración — the inviter sets a temporary password and shares it
  // with the person directly; the notification email just points at /login).
  if (!existingPortalUser) {
    try {
      await inviteTeamMember({
        name: normalizedName,
        email: normalizedEmail,
        role: SMARTCARD_ROLE_TO_USER_ROLE[normalizedRole],
        password,
      });
    } catch (portalError) {
      console.error(
        "[smartcard/actions] inviteTeamMember falló, revirtiendo company_users/auth de Supabase:",
        portalError
      );
      await supabase.from("company_users").delete().eq("company_id", membership.companyId).eq("user_id", supabaseUserId);
      if (createdSupabaseUser) {
        await supabase.auth.admin.deleteUser(supabaseUserId).catch(() => {});
      }
      throw portalError instanceof Error ? portalError : new Error("No se pudo crear la cuenta del portal.");
    }
  }
}
