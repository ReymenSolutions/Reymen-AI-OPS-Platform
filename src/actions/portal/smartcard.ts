"use server";

import { revalidatePath } from "next/cache";
import QRCode from "qrcode";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSmartcardAdminClient } from "@/lib/smartcard-supabase";
import { resolveSmartcardMembership, buildSmartcardPublicUrl } from "@/lib/smartcard-company";
import { findOrCreateSmartcardAuthUser } from "@/lib/smartcard-link";
import { inviteTeamMember } from "@/actions/team";
import { UserError } from "@/lib/user-error";

// Owner/admin/manager can edit a company's own cards and download their QR
// — widened from owner/admin-only (2026-09-29, explicit ask: a manager
// shouldn't have to wait on the owner or Reymen for something this
// routine). Team invites (inviteSmartcardTeamMember below) intentionally
// keep the narrower owner/admin-only scope — that decision wasn't revisited.
const CARD_MANAGEMENT_ROLES = ["owner", "admin", "manager"];

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
    throw new UserError("Sesión inválida.");
  }

  const result = await resolveSmartcardMembership(session.user.organizationId, session.user.email);
  if (!result.ok) {
    throw new UserError("No se pudo confirmar tu membresía en SmartCard. Recarga la página e intenta de nuevo.");
  }
  if (!["owner", "admin"].includes(result.membership.roleCode)) {
    throw new UserError("No tienes permiso para hacer eso.");
  }
  const { membership } = result;

  const normalizedName = name.trim();
  const normalizedEmail = email.trim().toLowerCase();
  const normalizedRole = roleCode.trim();
  if (normalizedName.length < 2) throw new UserError("El nombre debe tener al menos 2 caracteres.");
  if (!normalizedEmail) throw new UserError("El correo es obligatorio.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) throw new UserError("Ese correo no parece válido.");
  if (!INVITABLE_ROLES.includes(normalizedRole)) throw new UserError("Ese rol no es válido.");
  if (!password || password.length < 8) throw new UserError("La contraseña temporal debe tener al menos 8 caracteres.");

  // Fail fast, before touching Supabase: does this email already belong to
  // a portal account, and if so, whose?
  const existingPortalUser = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (existingPortalUser && existingPortalUser.organizationId !== session.user.organizationId) {
    throw new UserError("Ese correo ya pertenece a una cuenta de otra organización.");
  }

  const supabase = getSmartcardAdminClient();
  if (!supabase) throw new UserError("SmartCard aún no está configurado en este entorno.");

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
    throw new UserError("Llegaste al límite de integrantes de tu plan de SmartCard. Contacta a REYMEN para subir de plan.");
  }

  const { data: role } = await supabase.from("roles").select("id").eq("code", normalizedRole).maybeSingle();
  if (!role) throw new UserError("Ese rol no es válido.");

  // 1. Supabase Auth user: reuse if one already exists for this email (e.g.
  // added to SmartCard before, or belongs to another company too), otherwise
  // create one with a random password nobody will ever use.
  const { id: supabaseUserId, created: createdSupabaseUser } = await findOrCreateSmartcardAuthUser(
    supabase,
    normalizedEmail
  );

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
    throw new UserError("No se pudo agregar a la company. Intenta de nuevo.");
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

export type UpdateCardDestinationResult = { success: true } | { success: false; error: string };

/**
 * Self-service card editing (2026-09-29): lets a company's own owner/admin
 * change where a card's QR points (destination_type + destination_url)
 * without asking Reymen to do it. Confirmed against real data (2026-09-29,
 * Villa Gardenia's 3 test cards) that every card in use today is a plain
 * URL redirect (WHATSAPP/GOOGLE_REVIEWS/CUSTOM_URL/etc, destination_types
 * .requires_url) — none use PROFILE (requires_profile, the richer
 * admin_profiles/profile_links page) — so that type is deliberately
 * rejected here rather than half-supported; editing it is separate, bigger
 * scope for if/when a card actually needs it.
 *
 * cardId is client input and this runs on the unscoped service-role client
 * (see smartcard-supabase.ts's own warning: no RLS net here), so the
 * clients!inner(company_id) join below is the ONLY thing stopping one
 * company from editing another's card — never drop it.
 */
export async function updateSmartcardCardDestination(
  cardId: string,
  destinationType: string,
  destinationUrl: string
): Promise<UpdateCardDestinationResult> {
  try {
    await run(cardId, destinationType, destinationUrl);
    revalidatePath("/portal/smartcard");
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo guardar el cambio. Intenta de nuevo.";
    if (!(err instanceof Error)) {
      console.error("[smartcard/actions] updateSmartcardCardDestination falló con un valor no-Error:", err);
    }
    return { success: false, error: message };
  }

  async function run(cardId: string, destinationType: string, destinationUrl: string): Promise<void> {
    const session = await auth();
    if (!session?.user.organizationId || !session.user.email) {
      throw new UserError("Sesión inválida.");
    }

    const result = await resolveSmartcardMembership(session.user.organizationId, session.user.email);
    if (!result.ok) {
      throw new UserError("No se pudo confirmar tu membresía en SmartCard. Recarga la página e intenta de nuevo.");
    }
    if (!CARD_MANAGEMENT_ROLES.includes(result.membership.roleCode)) {
      throw new UserError("No tienes permiso para editar tarjetas.");
    }

    const supabase = getSmartcardAdminClient();
    if (!supabase) throw new UserError("SmartCard aún no está configurado en este entorno.");

    const { data: card, error: cardError } = await supabase
      .from("cards")
      .select("id, clients!inner(company_id)")
      .eq("id", cardId)
      .is("deleted_at", null)
      .maybeSingle<{ id: string; clients: { company_id: string } }>();

    if (cardError) {
      console.error("[smartcard/actions] Error buscando card:", cardError.message);
      throw new UserError("No se pudo cargar la tarjeta. Intenta de nuevo.");
    }
    if (!card || card.clients.company_id !== result.membership.companyId) {
      throw new UserError("Esa tarjeta no pertenece a tu empresa.");
    }

    const { data: type, error: typeError } = await supabase
      .from("destination_types")
      .select("code, requires_profile, requires_url")
      .eq("code", destinationType)
      .eq("is_active", true)
      .maybeSingle();

    if (typeError) {
      console.error("[smartcard/actions] Error buscando destination_type:", typeError.message);
      throw new UserError("No se pudo validar el tipo de destino. Intenta de nuevo.");
    }
    if (!type) throw new UserError("Ese tipo de destino no es válido.");
    if (type.requires_profile) {
      throw new UserError(
        "Ese tipo de destino (perfil digital) todavía no se puede editar desde aquí. Contacta a Reymen."
      );
    }

    let normalizedUrl: string | null = null;
    if (type.requires_url) {
      normalizedUrl = destinationUrl.trim();
      if (!normalizedUrl) throw new UserError("Ese tipo de destino necesita una URL.");
      if (!/^https?:\/\//i.test(normalizedUrl)) {
        throw new UserError("La URL debe empezar con http:// o https://");
      }
    }

    const { error: updateError } = await supabase
      .from("cards")
      .update({
        destination_type: destinationType,
        destination_url: normalizedUrl,
        updated_at: new Date().toISOString(),
      })
      .eq("id", cardId);

    if (updateError) {
      console.error("[smartcard/actions] Error actualizando card:", updateError.message);
      throw new UserError("No se pudo guardar el cambio. Intenta de nuevo.");
    }
  }
}

export type SmartcardCardQrResult =
  | { success: true; dataUrl: string; url: string }
  | { success: false; error: string };

/**
 * Generates a downloadable QR (PNG data URL) for a card's public scan URL
 * — buildSmartcardPublicUrl (link.reymen.mx/q/{card_code}), confirmed
 * 2026-09-29 against a real live card. Same company-scoping check as
 * updateSmartcardCardDestination (cardId is client input on the unscoped
 * service-role client — never skip the clients!inner(company_id) join),
 * same CARD_MANAGEMENT_ROLES permission.
 */
export async function getSmartcardCardQrCode(cardId: string): Promise<SmartcardCardQrResult> {
  try {
    const session = await auth();
    if (!session?.user.organizationId || !session.user.email) {
      throw new UserError("Sesión inválida.");
    }

    const result = await resolveSmartcardMembership(session.user.organizationId, session.user.email);
    if (!result.ok) {
      throw new UserError("No se pudo confirmar tu membresía en SmartCard. Recarga la página e intenta de nuevo.");
    }
    if (!CARD_MANAGEMENT_ROLES.includes(result.membership.roleCode)) {
      throw new UserError("No tienes permiso para descargar el QR de esta tarjeta.");
    }

    const supabase = getSmartcardAdminClient();
    if (!supabase) throw new UserError("SmartCard aún no está configurado en este entorno.");

    const { data: card, error: cardError } = await supabase
      .from("cards")
      .select("id, card_code, clients!inner(company_id)")
      .eq("id", cardId)
      .is("deleted_at", null)
      .maybeSingle<{ id: string; card_code: string | null; clients: { company_id: string } }>();

    if (cardError) {
      console.error("[smartcard/actions] Error buscando card para QR:", cardError.message);
      throw new UserError("No se pudo cargar la tarjeta. Intenta de nuevo.");
    }
    if (!card || card.clients.company_id !== result.membership.companyId) {
      throw new UserError("Esa tarjeta no pertenece a tu empresa.");
    }
    if (!card.card_code) {
      throw new UserError("Esta tarjeta todavía no tiene un código asignado.");
    }

    const url = buildSmartcardPublicUrl(card.card_code);
    const dataUrl = await QRCode.toDataURL(url, { margin: 1, width: 512 });

    return { success: true, dataUrl, url };
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo generar el QR. Intenta de nuevo.";
    if (!(err instanceof Error)) {
      console.error("[smartcard/actions] getSmartcardCardQrCode falló con un valor no-Error:", err);
    }
    return { success: false, error: message };
  }
}
