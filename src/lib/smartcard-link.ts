import crypto from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSmartcardAdminClient } from "./smartcard-supabase";
import { UserError } from "./user-error";
import type {
  SmartcardCompanyOption,
  SmartcardLinkRole,
  SmartcardLinkState,
} from "./smartcard-link-shared";

/**
 * Vinculación de un cliente de Reymen con su empresa en SmartCard, para
 * hacerla desde Admin → Clientes en lugar del admin de SmartCard. Es lo que
 * resolveSmartcardMembership (smartcard-company.ts) necesita para mostrar el
 * panel: companies.external_org_id = id del cliente, y el correo con el que
 * entra la persona como miembro activo (company_users) de esa empresa.
 *
 * Corre con la llave de servicio (sin RLS): cada consulta filtra por
 * empresa o usuario de forma explícita.
 */

function requireClient(): SupabaseClient {
  const supabase = getSmartcardAdminClient();
  if (!supabase) throw new UserError("SmartCard aún no está configurado en este entorno.");
  return supabase;
}

export async function getSmartcardLinkState(organizationId: string): Promise<SmartcardLinkState> {
  const supabase = getSmartcardAdminClient();
  if (!supabase) return { status: "not_configured" };

  const { data: company, error } = await supabase
    .from("companies")
    .select("id, name, slug")
    .eq("external_org_id", organizationId)
    .maybeSingle();
  if (error) {
    console.error("[smartcard-link] Error buscando company:", error.message);
    return { status: "error" };
  }

  if (!company) {
    const { data: free, error: freeError } = await supabase
      .from("companies")
      .select("id, name, slug")
      .is("external_org_id", null)
      .order("name", { ascending: true });
    if (freeError) {
      console.error("[smartcard-link] Error listando companies:", freeError.message);
      return { status: "error" };
    }
    return { status: "unlinked", candidates: free ?? [] };
  }

  const [{ data: rows, error: membersError }, { data: roles }] = await Promise.all([
    supabase
      .from("company_users")
      .select("id, user_id, role_id, status")
      .eq("company_id", company.id)
      .order("created_at", { ascending: true }),
    supabase.from("roles").select("id, code"),
  ]);
  if (membersError) {
    console.error("[smartcard-link] Error listando company_users:", membersError.message);
    return { status: "error" };
  }

  const roleCodeById = new Map((roles ?? []).map((r) => [r.id as string, r.code as string]));
  const members = await Promise.all(
    (rows ?? []).map(async (m) => {
      const { data } = await supabase.auth.admin.getUserById(m.user_id);
      return {
        id: m.id as string,
        email: data?.user?.email?.toLowerCase() ?? null,
        roleCode: roleCodeById.get(m.role_id) ?? String(m.role_id),
        status: m.status as string,
      };
    })
  );
  return { status: "linked", company, members };
}

/** Liga una empresa de SmartCard libre al cliente. */
export async function linkSmartcardCompany(organizationId: string, companyId: string): Promise<SmartcardCompanyOption> {
  const supabase = requireClient();

  const { data: current } = await supabase
    .from("companies")
    .select("id")
    .eq("external_org_id", organizationId)
    .maybeSingle();
  if (current) throw new UserError("Este cliente ya está vinculado con una empresa de SmartCard.");

  // Solo si sigue libre: el filtro evita quitarle la empresa a otro cliente.
  const { data: updated, error } = await supabase
    .from("companies")
    .update({ external_org_id: organizationId })
    .eq("id", companyId)
    .is("external_org_id", null)
    .select("id, name, slug")
    .maybeSingle();
  if (error) {
    console.error("[smartcard-link] Error vinculando company:", error.message);
    throw new UserError("No se pudo vincular la empresa. Intenta de nuevo.");
  }
  if (!updated) throw new UserError("Esa empresa ya no está disponible: otro cliente la tiene vinculada.");
  return updated;
}

/** Quita la vinculación; la empresa, sus tarjetas y miembros quedan en SmartCard. */
export async function unlinkSmartcardCompany(organizationId: string): Promise<void> {
  const supabase = requireClient();
  const { error } = await supabase
    .from("companies")
    .update({ external_org_id: null })
    .eq("external_org_id", organizationId);
  if (error) {
    console.error("[smartcard-link] Error desvinculando company:", error.message);
    throw new UserError("No se pudo desvincular la empresa. Intenta de nuevo.");
  }
}

/**
 * Usuario de Supabase Auth de SmartCard para ese correo: lo reutiliza si ya
 * existe o lo crea con una contraseña aleatoria que nadie usa (el acceso es
 * con la cuenta de Reymen; este usuario solo existe para company_users).
 */
export async function findOrCreateSmartcardAuthUser(
  supabase: SupabaseClient,
  email: string
): Promise<{ id: string; created: boolean }> {
  const { data: created, error: createError } = await supabase.auth.admin.createUser({
    email,
    password: crypto.randomBytes(24).toString("hex"),
    email_confirm: true,
  });
  if (created?.user) return { id: created.user.id, created: true };

  if (createError?.message?.toLowerCase().includes("already")) {
    // admin.listUsers() paginado: el filtro por correo no es parte del
    // contrato de supabase-js.
    for (let page = 1; ; page++) {
      const { data: listed, error: listError } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
      if (listError || !listed?.users?.length) break;
      const match = listed.users.find((u) => u.email?.toLowerCase() === email);
      if (match) return { id: match.id, created: false };
      if (listed.users.length < 200) break;
    }
  }
  throw new UserError("No se pudo procesar la invitación. Intenta de nuevo.");
}

/**
 * Da acceso a SmartCard a un correo en la empresa vinculada al cliente:
 * crea el miembro activo, o reactiva y cambia el rol si ya existía.
 */
export async function addSmartcardMember(
  organizationId: string,
  email: string,
  roleCode: SmartcardLinkRole
): Promise<"added" | "updated"> {
  const supabase = requireClient();
  const normalizedEmail = email.trim().toLowerCase();

  const { data: company } = await supabase
    .from("companies")
    .select("id")
    .eq("external_org_id", organizationId)
    .maybeSingle();
  if (!company) throw new UserError("Primero vincula el cliente con una empresa de SmartCard.");

  const { data: role } = await supabase.from("roles").select("id").eq("code", roleCode).maybeSingle();
  if (!role) throw new UserError("Ese rol no es válido.");

  const user = await findOrCreateSmartcardAuthUser(supabase, normalizedEmail);

  const { data: existing } = await supabase
    .from("company_users")
    .select("id")
    .eq("company_id", company.id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("company_users")
      .update({ role_id: role.id, status: "active" })
      .eq("id", existing.id)
      .eq("company_id", company.id);
    if (error) {
      console.error("[smartcard-link] Error actualizando company_users:", error.message);
      throw new UserError("No se pudo dar acceso. Intenta de nuevo.");
    }
    return "updated";
  }

  const { error } = await supabase.from("company_users").insert({
    company_id: company.id,
    user_id: user.id,
    role_id: role.id,
    status: "active",
  });
  if (error) {
    console.error("[smartcard-link] Error insertando company_users:", error.message);
    if (user.created) {
      await supabase.auth.admin
        .deleteUser(user.id)
        .catch((e) => console.error("[smartcard-link] No se pudo revertir el usuario de Supabase:", e));
    }
    throw new UserError("No se pudo dar acceso. Revisa el límite de integrantes del plan de SmartCard.");
  }
  return "added";
}

/** Quita a un miembro de la empresa vinculada al cliente (solo de esa empresa). */
export async function removeSmartcardMember(organizationId: string, memberId: string): Promise<void> {
  const supabase = requireClient();
  const { data: company } = await supabase
    .from("companies")
    .select("id")
    .eq("external_org_id", organizationId)
    .maybeSingle();
  if (!company) throw new UserError("Este cliente no está vinculado con SmartCard.");

  const { data: removed, error } = await supabase
    .from("company_users")
    .delete()
    .eq("id", memberId)
    .eq("company_id", company.id)
    .select("id");
  if (error) {
    console.error("[smartcard-link] Error quitando company_users:", error.message);
    throw new UserError("No se pudo quitar el acceso. Intenta de nuevo.");
  }
  if (!removed?.length) throw new UserError("Ese miembro ya no existe.");
}
