import { getSmartcardAdminClient } from "./smartcard-supabase";
import { isValidLinkIcon } from "./smartcard-link-icons";
import { prisma } from "./prisma";
import { parseThemeConfig, buildThemeConfig, type ThemeConfigFields } from "./smartcard-theme";

/**
 * Acceso de SUPERADMIN/ADMIN a las entidades de SmartCard (clients, cards,
 * profiles) que viven en el Supabase de reymen-smartcard — a diferencia de
 * smartcard-company.ts (acotado a una sola company, lo que ve un
 * company_user en /portal/smartcard), este archivo es cross-tenant: lista y
 * modifica CUALQUIER cliente/tarjeta/perfil, exactamente lo que hoy solo se
 * podía hacer desde admin.reymen.mx (apps/admin/app/clients). Cada función
 * de escritura debe ser llamada solo detrás de requireAdmin() — el cliente
 * Supabase es service-role, sin RLS, no hay red de seguridad de base de
 * datos aquí.
 *
 * `clients` es la entidad "negocio" de la que cuelgan cards/profiles
 * (client_id) — distinta de `companies` (la capa multi-tenant de
 * REYMEN_OPS_PLAN.md, a la que ya se liga cada Organization de Reymen vía
 * smartcard-link.ts/external_org_id). clients.company_id es el puente entre
 * ambas, opcional: un cliente simple (solo redirección, sin autoservicio)
 * puede no tener company_id nunca.
 */

function sanitizeSearchTerm(raw: string): string {
  // Paréntesis/comas rompen la sintaxis del filtro .or() de PostgREST si
  // van literales dentro del término — se quitan en vez de escaparse, un
  // buscador de nombre/negocio/correo no necesita soportarlos.
  return raw.replace(/[,()%]/g, "").trim();
}

export interface SmartcardClientRow {
  id: string;
  name: string;
  businessName: string | null;
  email: string | null;
  phone: string | null;
  status: "ACTIVE" | "INACTIVE";
  companyId: string | null;
  companyName: string | null;
  createdAt: string;
}

export async function listSmartcardClients(search?: string): Promise<SmartcardClientRow[] | null> {
  const supabase = getSmartcardAdminClient();
  if (!supabase) return null;

  let query = supabase
    .from("clients")
    .select("id, name, business_name, email, phone, status, company_id, created_at")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  const term = search ? sanitizeSearchTerm(search) : "";
  if (term) {
    query = query.or(`name.ilike.%${term}%,business_name.ilike.%${term}%,email.ilike.%${term}%`);
  }

  const { data, error } = await query;
  if (error) {
    console.error("[smartcard-admin] Error listando clients:", error.message);
    return null;
  }
  if (!data?.length) return [];

  const companyIds = [...new Set(data.map((c) => c.company_id as string | null).filter((v): v is string => !!v))];
  const companyNameById = new Map<string, string>();
  if (companyIds.length) {
    const { data: companies } = await supabase.from("companies").select("id, name").in("id", companyIds);
    for (const c of companies ?? []) companyNameById.set(c.id as string, c.name as string);
  }

  return data.map((c) => ({
    id: c.id as string,
    name: c.name as string,
    businessName: c.business_name as string | null,
    email: c.email as string | null,
    phone: c.phone as string | null,
    status: c.status as "ACTIVE" | "INACTIVE",
    companyId: c.company_id as string | null,
    companyName: c.company_id ? (companyNameById.get(c.company_id as string) ?? null) : null,
    createdAt: c.created_at as string,
  }));
}

export interface SmartcardClientDetail {
  id: string;
  name: string;
  businessName: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  status: "ACTIVE" | "INACTIVE";
  companyId: string | null;
  deletedAt: string | null;
  createdAt: string;
}

export async function getSmartcardClient(id: string): Promise<SmartcardClientDetail | null> {
  const supabase = getSmartcardAdminClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("clients")
    .select("id, name, business_name, email, phone, notes, status, company_id, deleted_at, created_at")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("[smartcard-admin] Error buscando client:", error.message);
    return null;
  }
  if (!data) return null;

  return {
    id: data.id as string,
    name: data.name as string,
    businessName: data.business_name as string | null,
    email: data.email as string | null,
    phone: data.phone as string | null,
    notes: data.notes as string | null,
    status: data.status as "ACTIVE" | "INACTIVE",
    companyId: data.company_id as string | null,
    deletedAt: data.deleted_at as string | null,
    createdAt: data.created_at as string,
  };
}

export interface SmartcardCompanyOption {
  id: string;
  name: string;
  /** id del cliente que YA tiene esta company ligada (clients.company_id), si alguno. */
  linkedClientId: string | null;
}

/**
 * Catálogo de companies para el selector "Empresa (multi-tenant)" del
 * formulario de cliente — incluye a cuál cliente ya está ligada cada una
 * (si alguno) para que el formulario pueda avisar/bloquear un doble enlace,
 * mismo criterio que linkSmartcardCompany en smartcard-link.ts usa para el
 * enlace Organization-companies (nunca quitársela a otro sin querer).
 */
export async function listSmartcardCompanyOptions(): Promise<SmartcardCompanyOption[] | null> {
  const supabase = getSmartcardAdminClient();
  if (!supabase) return null;

  const [{ data: companies, error }, { data: clients }] = await Promise.all([
    supabase.from("companies").select("id, name").order("name", { ascending: true }),
    supabase.from("clients").select("id, company_id").is("deleted_at", null).not("company_id", "is", null),
  ]);
  if (error) {
    console.error("[smartcard-admin] Error listando companies:", error.message);
    return null;
  }

  const clientIdByCompanyId = new Map((clients ?? []).map((c) => [c.company_id as string, c.id as string]));
  return (companies ?? []).map((c) => ({
    id: c.id as string,
    name: c.name as string,
    linkedClientId: clientIdByCompanyId.get(c.id as string) ?? null,
  }));
}

export interface SmartcardClientInput {
  name: string;
  businessName: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  status: "ACTIVE" | "INACTIVE";
  companyId: string | null;
}

export type SmartcardAdminResult<T = { id: string }> = { ok: true; data: T } | { ok: false; error: string };

export async function createSmartcardClient(input: SmartcardClientInput): Promise<SmartcardAdminResult> {
  const supabase = getSmartcardAdminClient();
  if (!supabase) return { ok: false, error: "SmartCard aún no está configurado en este entorno." };

  const name = input.name.trim();
  if (!name) return { ok: false, error: "El nombre es obligatorio." };

  if (input.companyId) {
    const taken = await isCompanyAlreadyLinked(supabase, input.companyId, null);
    if (taken) return { ok: false, error: "Esa empresa ya está ligada a otro cliente." };
  }

  const { data, error } = await supabase
    .from("clients")
    .insert({
      name,
      business_name: input.businessName?.trim() || null,
      email: input.email?.trim() || null,
      phone: input.phone?.trim() || null,
      notes: input.notes?.trim() || null,
      status: input.status,
      company_id: input.companyId || null,
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("[smartcard-admin] Error creando client:", error?.message);
    return { ok: false, error: "No se pudo guardar el cliente. Intenta de nuevo." };
  }
  return { ok: true, data: { id: data.id as string } };
}

export async function updateSmartcardClient(
  id: string,
  input: SmartcardClientInput
): Promise<SmartcardAdminResult<null>> {
  const supabase = getSmartcardAdminClient();
  if (!supabase) return { ok: false, error: "SmartCard aún no está configurado en este entorno." };

  const name = input.name.trim();
  if (!name) return { ok: false, error: "El nombre es obligatorio." };

  if (input.companyId) {
    const taken = await isCompanyAlreadyLinked(supabase, input.companyId, id);
    if (taken) return { ok: false, error: "Esa empresa ya está ligada a otro cliente." };
  }

  const { error } = await supabase
    .from("clients")
    .update({
      name,
      business_name: input.businessName?.trim() || null,
      email: input.email?.trim() || null,
      phone: input.phone?.trim() || null,
      notes: input.notes?.trim() || null,
      status: input.status,
      company_id: input.companyId || null,
    })
    .eq("id", id);

  if (error) {
    console.error("[smartcard-admin] Error actualizando client:", error.message);
    return { ok: false, error: "No se pudo guardar el cliente. Intenta de nuevo." };
  }
  return { ok: true, data: null };
}

async function isCompanyAlreadyLinked(
  supabase: ReturnType<typeof getSmartcardAdminClient>,
  companyId: string,
  exceptClientId: string | null
): Promise<boolean> {
  if (!supabase) return false;
  let query = supabase.from("clients").select("id").eq("company_id", companyId).is("deleted_at", null);
  if (exceptClientId) query = query.neq("id", exceptClientId);
  const { data } = await query.maybeSingle();
  return !!data;
}

export async function softDeleteSmartcardClient(id: string): Promise<SmartcardAdminResult<null>> {
  const supabase = getSmartcardAdminClient();
  if (!supabase) return { ok: false, error: "SmartCard aún no está configurado en este entorno." };
  const { error } = await supabase.from("clients").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  if (error) {
    console.error("[smartcard-admin] Error dando de baja client:", error.message);
    return { ok: false, error: "No se pudo dar de baja al cliente. Intenta de nuevo." };
  }
  return { ok: true, data: null };
}

export interface ClientProfileSummary {
  id: string;
  slug: string;
  displayName: string;
  status: string;
}

export interface ClientCardSummary {
  id: string;
  cardCode: string;
  destinationType: string;
  status: string;
}

/** Perfiles/tarjetas de un cliente, para la vista embebida en su detalle
 * (mismo patrón de solo-lectura-hasta-que-exista-su-propia-pantalla que
 * admin.reymen.mx's apps/admin/app/clients/[id]/page.tsx ya usaba). */
export async function listClientProfiles(clientId: string): Promise<ClientProfileSummary[]> {
  const supabase = getSmartcardAdminClient();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("profiles")
    .select("id, slug, display_name, status")
    .eq("client_id", clientId)
    .is("deleted_at", null);
  if (error) {
    console.error("[smartcard-admin] Error listando profiles del cliente:", error.message);
    return [];
  }
  return (data ?? []).map((p) => ({
    id: p.id as string,
    slug: p.slug as string,
    displayName: p.display_name as string,
    status: p.status as string,
  }));
}

export async function listClientCards(clientId: string): Promise<ClientCardSummary[]> {
  const supabase = getSmartcardAdminClient();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("cards")
    .select("id, card_code, destination_type, status")
    .eq("client_id", clientId)
    .is("deleted_at", null);
  if (error) {
    console.error("[smartcard-admin] Error listando cards del cliente:", error.message);
    return [];
  }
  return (data ?? []).map((c) => ({
    id: c.id as string,
    cardCode: c.card_code as string,
    destinationType: c.destination_type as string,
    status: c.status as string,
  }));
}

export async function reactivateSmartcardClient(id: string): Promise<SmartcardAdminResult<null>> {
  const supabase = getSmartcardAdminClient();
  if (!supabase) return { ok: false, error: "SmartCard aún no está configurado en este entorno." };
  const { error } = await supabase.from("clients").update({ deleted_at: null }).eq("id", id);
  if (error) {
    console.error("[smartcard-admin] Error reactivando client:", error.message);
    return { ok: false, error: "No se pudo reactivar al cliente. Intenta de nuevo." };
  }
  return { ok: true, data: null };
}

/**
 * --- Tarjetas (cards) ---
 *
 * Mismo criterio cross-tenant que Clientes arriba: antes solo se podía hacer
 * desde admin.reymen.mx (apps/admin/app/cards). card_code (REY-000001, etc.)
 * nunca se manda en el insert — lo genera un trigger de Postgres
 * (set_card_code(), ver functions_and_triggers.sql) a partir de
 * card_code_seq, igual que allá.
 */

export interface SmartcardCardRow {
  id: string;
  cardCode: string | null;
  destinationType: string;
  status: "ACTIVE" | "INACTIVE";
  clientId: string;
  clientName: string | null;
  createdAt: string;
}

export async function listSmartcardCards(opts?: {
  search?: string;
  clientId?: string;
}): Promise<SmartcardCardRow[] | null> {
  const supabase = getSmartcardAdminClient();
  if (!supabase) return null;

  let query = supabase
    .from("cards")
    .select("id, card_code, destination_type, status, client_id, clients(name), created_at")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (opts?.clientId) query = query.eq("client_id", opts.clientId);

  const term = opts?.search ? sanitizeSearchTerm(opts.search) : "";
  if (term) query = query.ilike("card_code", `%${term}%`);

  const { data, error } = await query;
  if (error) {
    console.error("[smartcard-admin] Error listando cards:", error.message);
    return null;
  }

  return (data ?? []).map((c) => ({
    id: c.id as string,
    cardCode: c.card_code as string | null,
    destinationType: c.destination_type as string,
    status: c.status as "ACTIVE" | "INACTIVE",
    clientId: c.client_id as string,
    clientName: (c.clients as unknown as { name: string } | null)?.name ?? null,
    createdAt: c.created_at as string,
  }));
}

export interface SmartcardCardDetail {
  id: string;
  cardCode: string | null;
  destinationType: string;
  profileId: string | null;
  destinationUrl: string | null;
  notes: string | null;
  status: "ACTIVE" | "INACTIVE";
  clientId: string;
  clientName: string | null;
  deletedAt: string | null;
  createdAt: string;
}

export async function getSmartcardCard(id: string): Promise<SmartcardCardDetail | null> {
  const supabase = getSmartcardAdminClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("cards")
    .select(
      "id, card_code, destination_type, profile_id, destination_url, notes, status, client_id, clients(name), deleted_at, created_at"
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("[smartcard-admin] Error buscando card:", error.message);
    return null;
  }
  if (!data) return null;

  return {
    id: data.id as string,
    cardCode: data.card_code as string | null,
    destinationType: data.destination_type as string,
    profileId: data.profile_id as string | null,
    destinationUrl: data.destination_url as string | null,
    notes: data.notes as string | null,
    status: data.status as "ACTIVE" | "INACTIVE",
    clientId: data.client_id as string,
    clientName: (data.clients as unknown as { name: string } | null)?.name ?? null,
    deletedAt: data.deleted_at as string | null,
    createdAt: data.created_at as string,
  };
}

export interface SmartcardClientOption {
  id: string;
  name: string;
}

/** Catálogo liviano de clientes para el selector "Cliente" del formulario de
 * tarjeta — a diferencia de listSmartcardClients, no trae company/email/etc. */
export async function listSmartcardClientOptions(): Promise<SmartcardClientOption[] | null> {
  const supabase = getSmartcardAdminClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("clients")
    .select("id, name")
    .is("deleted_at", null)
    .order("name", { ascending: true });

  if (error) {
    console.error("[smartcard-admin] Error listando clientes (options):", error.message);
    return null;
  }
  return (data ?? []).map((c) => ({ id: c.id as string, name: c.name as string }));
}

export interface SmartcardProfileOption {
  id: string;
  displayName: string;
  slug: string;
  clientName: string | null;
}

/** Catálogo de perfiles para el selector que aparece solo cuando el tipo de
 * destino elegido es PROFILE (requires_profile) — mismo query que
 * admin.reymen.mx's apps/admin/app/cards/new/page.tsx. */
export async function listSmartcardProfileOptions(): Promise<SmartcardProfileOption[] | null> {
  const supabase = getSmartcardAdminClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("id, display_name, slug, clients(name)")
    .is("deleted_at", null)
    .order("display_name", { ascending: true });

  if (error) {
    console.error("[smartcard-admin] Error listando perfiles (options):", error.message);
    return null;
  }
  return (data ?? []).map((p) => ({
    id: p.id as string,
    displayName: p.display_name as string,
    slug: p.slug as string,
    clientName: (p.clients as unknown as { name: string } | null)?.name ?? null,
  }));
}

export interface SmartcardCardInput {
  clientId: string;
  destinationType: string;
  profileId: string | null;
  destinationUrl: string | null;
  notes: string | null;
  status: "ACTIVE" | "INACTIVE";
}

/**
 * Misma regla que `validate_card_destination()` aplica en SQL (trigger,
 * Fase 2) y que `CardDestinationFields`/`updateSmartcardCardDestination` ya
 * reflejan en UI/portal: un tipo de destino PROFILE exige profile_id (nunca
 * destination_url), uno con requires_url exige una URL http(s) (nunca
 * profile_id). Validar aquí también da un mensaje legible de inmediato en
 * vez de depender solo del texto crudo que devolvería el trigger.
 */
async function validateCardDestination(
  supabase: ReturnType<typeof getSmartcardAdminClient>,
  destinationType: string,
  profileId: string | null,
  destinationUrl: string | null
): Promise<{ ok: true; profileId: string | null; destinationUrl: string | null } | { ok: false; error: string }> {
  if (!supabase) return { ok: false, error: "SmartCard aún no está configurado en este entorno." };

  const { data: type, error } = await supabase
    .from("destination_types")
    .select("code, requires_profile, requires_url")
    .eq("code", destinationType)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    console.error("[smartcard-admin] Error buscando destination_type:", error.message);
    return { ok: false, error: "No se pudo validar el tipo de destino. Intenta de nuevo." };
  }
  if (!type) return { ok: false, error: "Ese tipo de destino no es válido." };

  if (type.requires_profile) {
    if (!profileId) return { ok: false, error: "Ese tipo de destino necesita que elijas un perfil digital." };
    return { ok: true, profileId, destinationUrl: null };
  }

  if (type.requires_url) {
    const url = (destinationUrl ?? "").trim();
    if (!url) return { ok: false, error: "Ese tipo de destino necesita una URL de destino." };
    if (!/^https?:\/\//i.test(url)) return { ok: false, error: "La URL de destino debe empezar con http:// o https://" };
    return { ok: true, profileId: null, destinationUrl: url };
  }

  return { ok: true, profileId: null, destinationUrl: null };
}

export async function createSmartcardCard(input: SmartcardCardInput): Promise<SmartcardAdminResult> {
  const supabase = getSmartcardAdminClient();
  if (!supabase) return { ok: false, error: "SmartCard aún no está configurado en este entorno." };
  if (!input.clientId) return { ok: false, error: "El cliente es obligatorio." };

  const validated = await validateCardDestination(supabase, input.destinationType, input.profileId, input.destinationUrl);
  if (!validated.ok) return validated;

  const { data, error } = await supabase
    .from("cards")
    .insert({
      client_id: input.clientId,
      destination_type: input.destinationType,
      profile_id: validated.profileId,
      destination_url: validated.destinationUrl,
      notes: input.notes?.trim() || null,
      status: input.status,
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("[smartcard-admin] Error creando card:", error?.message);
    return { ok: false, error: "No se pudo guardar la tarjeta. Intenta de nuevo." };
  }
  return { ok: true, data: { id: data.id as string } };
}

export async function updateSmartcardCard(
  id: string,
  input: SmartcardCardInput
): Promise<SmartcardAdminResult<{ destinationChanged: boolean }>> {
  const supabase = getSmartcardAdminClient();
  if (!supabase) return { ok: false, error: "SmartCard aún no está configurado en este entorno." };
  if (!input.clientId) return { ok: false, error: "El cliente es obligatorio." };

  const validated = await validateCardDestination(supabase, input.destinationType, input.profileId, input.destinationUrl);
  if (!validated.ok) return validated;

  const { data: before } = await supabase
    .from("cards")
    .select("destination_type, profile_id, destination_url")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase
    .from("cards")
    .update({
      client_id: input.clientId,
      destination_type: input.destinationType,
      profile_id: validated.profileId,
      destination_url: validated.destinationUrl,
      notes: input.notes?.trim() || null,
      status: input.status,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    console.error("[smartcard-admin] Error actualizando card:", error.message);
    return { ok: false, error: "No se pudo guardar la tarjeta. Intenta de nuevo." };
  }

  // Mismo criterio que admin.reymen.mx's apps/admin/app/cards/[id]/actions.ts:
  // "cambiar el destino de una tarjeta sin tocar la tarjeta física" es el
  // mecanismo central del producto, así que ese cambio en particular se
  // distingue en el audit log (card.destination_changed) de un card.updated
  // genérico (p.ej. solo notas o estado).
  const destinationChanged =
    !!before &&
    (before.destination_type !== input.destinationType ||
      before.profile_id !== validated.profileId ||
      before.destination_url !== validated.destinationUrl);

  return { ok: true, data: { destinationChanged } };
}

export async function softDeleteSmartcardCard(id: string): Promise<SmartcardAdminResult<null>> {
  const supabase = getSmartcardAdminClient();
  if (!supabase) return { ok: false, error: "SmartCard aún no está configurado en este entorno." };
  const { error } = await supabase.from("cards").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  if (error) {
    console.error("[smartcard-admin] Error dando de baja card:", error.message);
    return { ok: false, error: "No se pudo dar de baja la tarjeta. Intenta de nuevo." };
  }
  return { ok: true, data: null };
}

export async function reactivateSmartcardCard(id: string): Promise<SmartcardAdminResult<null>> {
  const supabase = getSmartcardAdminClient();
  if (!supabase) return { ok: false, error: "SmartCard aún no está configurado en este entorno." };
  const { error } = await supabase.from("cards").update({ deleted_at: null }).eq("id", id);
  if (error) {
    console.error("[smartcard-admin] Error reactivando card:", error.message);
    return { ok: false, error: "No se pudo reactivar la tarjeta. Intenta de nuevo." };
  }
  return { ok: true, data: null };
}

/**
 * --- Perfiles digitales (profiles) ---
 *
 * Versión cross-tenant/completa — a diferencia de getSmartcardProfile/
 * updateProfileThemeColors en smartcard-company.ts (acotado a una company,
 * solo display_name + contacto + tema básico, lo que ve un company_user en
 * /portal/smartcard), aquí vive TODO lo que admin.reymen.mx's
 * apps/admin/app/profiles exponía: slug, theme_id (catálogo completo),
 * status, is_noindex, y el CRUD de profile_links (con ícono, orden,
 * activar/desactivar). Deliberadamente NO incluye la subida de foto/logo a
 * Supabase Storage (apps/admin/app/profiles/[id]/media-actions.ts) — ese es
 * un pedazo aparte y más grande (bucket, magic-bytes, límites de tamaño);
 * photo_url/logo_url siguen siendo campos de solo pegar una URL, igual que
 * ya decidió el formulario de autoservicio (ver comentario de
 * updateSmartcardProfile en actions/portal/smartcard.ts).
 */

function describeProfileSaveError(error: { message: string; code?: string } | null): string {
  if (!error) return "No se pudo guardar el perfil. Intenta de nuevo.";
  // 23505 = unique_violation (idx_profiles_slug_active, slug único entre perfiles no borrados).
  if (error.code === "23505") return "Ese slug ya lo está usando otro perfil activo. Elige uno distinto.";
  // 23514 = check_violation (formato del slug) / P0001 = excepción propia de prevent_reserved_slug().
  if (error.code === "23514" || error.code === "P0001") {
    return 'Ese slug no es válido: usa solo minúsculas, números y guiones simples (ej. "juan-perez"), y confirma que no sea una palabra reservada (admin, login, api, etc.).';
  }
  console.error("[smartcard-admin] Error guardando profile:", error.message);
  return "No se pudo guardar el perfil. Intenta de nuevo.";
}

export interface SmartcardAdminProfileRow {
  id: string;
  slug: string;
  displayName: string;
  company: string | null;
  status: "ACTIVE" | "INACTIVE";
  clientId: string;
  clientName: string | null;
  createdAt: string;
}

export async function listSmartcardProfiles(opts?: {
  search?: string;
  clientId?: string;
}): Promise<SmartcardAdminProfileRow[] | null> {
  const supabase = getSmartcardAdminClient();
  if (!supabase) return null;

  let query = supabase
    .from("profiles")
    .select("id, slug, display_name, company, status, client_id, clients(name), created_at")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (opts?.clientId) query = query.eq("client_id", opts.clientId);

  const term = opts?.search ? sanitizeSearchTerm(opts.search) : "";
  if (term) query = query.or(`display_name.ilike.%${term}%,slug.ilike.%${term}%,company.ilike.%${term}%`);

  const { data, error } = await query;
  if (error) {
    console.error("[smartcard-admin] Error listando profiles:", error.message);
    return null;
  }

  return (data ?? []).map((p) => ({
    id: p.id as string,
    slug: p.slug as string,
    displayName: p.display_name as string,
    company: p.company as string | null,
    status: p.status as "ACTIVE" | "INACTIVE",
    clientId: p.client_id as string,
    clientName: (p.clients as unknown as { name: string } | null)?.name ?? null,
    createdAt: p.created_at as string,
  }));
}

export interface SmartcardThemeOption {
  id: string;
  name: string;
}

export async function listSmartcardThemes(): Promise<SmartcardThemeOption[] | null> {
  const supabase = getSmartcardAdminClient();
  if (!supabase) return null;

  const { data, error } = await supabase.from("themes").select("id, name").eq("is_active", true).order("name");
  if (error) {
    console.error("[smartcard-admin] Error listando themes:", error.message);
    return null;
  }
  return (data ?? []).map((t) => ({ id: t.id as string, name: t.name as string }));
}

export interface SmartcardAdminProfileDetail {
  id: string;
  slug: string;
  displayName: string;
  firstName: string | null;
  lastName: string | null;
  jobTitle: string | null;
  company: string | null;
  bio: string | null;
  photoUrl: string | null;
  logoUrl: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  website: string | null;
  address: string | null;
  mapsUrl: string | null;
  instagram: string | null;
  facebook: string | null;
  linkedin: string | null;
  tiktok: string | null;
  youtube: string | null;
  themeId: string | null;
  status: "ACTIVE" | "INACTIVE";
  isNoindex: boolean;
  clientId: string;
  clientName: string | null;
  deletedAt: string | null;
  createdAt: string;
}

export async function getSmartcardAdminProfile(id: string): Promise<SmartcardAdminProfileDetail | null> {
  const supabase = getSmartcardAdminClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select(
      "id, slug, display_name, first_name, last_name, job_title, company, bio, photo_url, logo_url, phone, whatsapp, email, website, address, maps_url, instagram, facebook, linkedin, tiktok, youtube, theme_id, status, is_noindex, client_id, clients(name), deleted_at, created_at"
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("[smartcard-admin] Error buscando profile:", error.message);
    return null;
  }
  if (!data) return null;

  return {
    id: data.id as string,
    slug: data.slug as string,
    displayName: data.display_name as string,
    firstName: data.first_name as string | null,
    lastName: data.last_name as string | null,
    jobTitle: data.job_title as string | null,
    company: data.company as string | null,
    bio: data.bio as string | null,
    photoUrl: data.photo_url as string | null,
    logoUrl: data.logo_url as string | null,
    phone: data.phone as string | null,
    whatsapp: data.whatsapp as string | null,
    email: data.email as string | null,
    website: data.website as string | null,
    address: data.address as string | null,
    mapsUrl: data.maps_url as string | null,
    instagram: data.instagram as string | null,
    facebook: data.facebook as string | null,
    linkedin: data.linkedin as string | null,
    tiktok: data.tiktok as string | null,
    youtube: data.youtube as string | null,
    themeId: data.theme_id as string | null,
    status: data.status as "ACTIVE" | "INACTIVE",
    isNoindex: data.is_noindex as boolean,
    clientId: data.client_id as string,
    clientName: (data.clients as unknown as { name: string } | null)?.name ?? null,
    deletedAt: data.deleted_at as string | null,
    createdAt: data.created_at as string,
  };
}

export interface SmartcardAdminProfileInput {
  slug: string;
  displayName: string;
  firstName: string | null;
  lastName: string | null;
  jobTitle: string | null;
  company: string | null;
  bio: string | null;
  photoUrl: string | null;
  logoUrl: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  website: string | null;
  address: string | null;
  mapsUrl: string | null;
  instagram: string | null;
  facebook: string | null;
  linkedin: string | null;
  tiktok: string | null;
  youtube: string | null;
  themeId: string | null;
  status: "ACTIVE" | "INACTIVE";
  isNoindex: boolean;
}

function profileColumns(input: SmartcardAdminProfileInput) {
  return {
    slug: input.slug.trim().toLowerCase(),
    display_name: input.displayName.trim(),
    first_name: input.firstName?.trim() || null,
    last_name: input.lastName?.trim() || null,
    job_title: input.jobTitle?.trim() || null,
    company: input.company?.trim() || null,
    bio: input.bio?.trim() || null,
    photo_url: input.photoUrl?.trim() || null,
    logo_url: input.logoUrl?.trim() || null,
    phone: input.phone?.trim() || null,
    whatsapp: input.whatsapp?.trim() || null,
    email: input.email?.trim() || null,
    website: input.website?.trim() || null,
    address: input.address?.trim() || null,
    maps_url: input.mapsUrl?.trim() || null,
    instagram: input.instagram?.trim() || null,
    facebook: input.facebook?.trim() || null,
    linkedin: input.linkedin?.trim() || null,
    tiktok: input.tiktok?.trim() || null,
    youtube: input.youtube?.trim() || null,
    theme_id: input.themeId?.trim() || null,
    status: input.status,
    is_noindex: input.isNoindex,
  };
}

export async function createSmartcardAdminProfile(
  clientId: string,
  input: SmartcardAdminProfileInput
): Promise<SmartcardAdminResult> {
  const supabase = getSmartcardAdminClient();
  if (!supabase) return { ok: false, error: "SmartCard aún no está configurado en este entorno." };
  if (!clientId) return { ok: false, error: "El cliente es obligatorio." };
  if (!input.slug.trim() || !input.displayName.trim()) {
    return { ok: false, error: "El slug y el nombre a mostrar son obligatorios." };
  }

  const { data, error } = await supabase
    .from("profiles")
    .insert({ client_id: clientId, ...profileColumns(input) })
    .select("id")
    .single();

  if (error || !data) return { ok: false, error: describeProfileSaveError(error) };
  return { ok: true, data: { id: data.id as string } };
}

export async function updateSmartcardAdminProfile(
  id: string,
  input: SmartcardAdminProfileInput
): Promise<SmartcardAdminResult<null>> {
  const supabase = getSmartcardAdminClient();
  if (!supabase) return { ok: false, error: "SmartCard aún no está configurado en este entorno." };
  if (!input.slug.trim() || !input.displayName.trim()) {
    return { ok: false, error: "El slug y el nombre a mostrar son obligatorios." };
  }

  const { error } = await supabase
    .from("profiles")
    .update({ ...profileColumns(input), updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return { ok: false, error: describeProfileSaveError(error) };
  return { ok: true, data: null };
}

export async function softDeleteSmartcardAdminProfile(id: string): Promise<SmartcardAdminResult<null>> {
  const supabase = getSmartcardAdminClient();
  if (!supabase) return { ok: false, error: "SmartCard aún no está configurado en este entorno." };
  const { error } = await supabase.from("profiles").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  if (error) {
    console.error("[smartcard-admin] Error dando de baja profile:", error.message);
    return { ok: false, error: "No se pudo dar de baja el perfil. Intenta de nuevo." };
  }
  return { ok: true, data: null };
}

export async function reactivateSmartcardAdminProfile(id: string): Promise<SmartcardAdminResult<null>> {
  const supabase = getSmartcardAdminClient();
  if (!supabase) return { ok: false, error: "SmartCard aún no está configurado en este entorno." };
  const { error } = await supabase.from("profiles").update({ deleted_at: null }).eq("id", id);
  if (error) {
    console.error("[smartcard-admin] Error reactivando profile:", error.message);
    return { ok: false, error: "No se pudo reactivar el perfil. Intenta de nuevo." };
  }
  return { ok: true, data: null };
}

/**
 * --- profile_links (desde el panel de admin) ---
 *
 * Mismo criterio que admin.reymen.mx's apps/admin/app/profiles/[id]/actions.ts:
 * SUPERADMIN+ADMIN pueden editar links (no solo SUPERADMIN, a diferencia de
 * borrar el perfil completo), y estos cambios NO se registran uno por uno en
 * audit_logs a propósito — el cambio que sí importa rastrear es el del
 * perfil mismo (ver createSmartcardAdminProfile/updateSmartcardAdminProfile
 * y sus Server Actions).
 */

export interface SmartcardAdminProfileLink {
  id: string;
  title: string;
  url: string;
  icon: string | null;
  isActive: boolean;
  sortOrder: number;
}

export async function listSmartcardAdminProfileLinks(profileId: string): Promise<SmartcardAdminProfileLink[]> {
  const supabase = getSmartcardAdminClient();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("profile_links")
    .select("id, title, url, icon, is_active, sort_order")
    .eq("profile_id", profileId)
    .order("sort_order", { ascending: true });
  if (error) {
    console.error("[smartcard-admin] Error listando profile_links:", error.message);
    return [];
  }
  return (data ?? []).map((l) => ({
    id: l.id as string,
    title: l.title as string,
    url: l.url as string,
    icon: l.icon as string | null,
    isActive: l.is_active as boolean,
    sortOrder: l.sort_order as number,
  }));
}

export async function addSmartcardAdminProfileLink(
  profileId: string,
  input: { title: string; url: string; icon: string | null }
): Promise<SmartcardAdminResult> {
  const supabase = getSmartcardAdminClient();
  if (!supabase) return { ok: false, error: "SmartCard aún no está configurado en este entorno." };

  const title = input.title.trim();
  const url = input.url.trim();
  if (!title || !url) return { ok: false, error: "El título y la URL del link son obligatorios." };
  if (!/^https?:\/\//i.test(url)) return { ok: false, error: "La URL del link debe empezar con http:// o https://" };
  const icon = input.icon && isValidLinkIcon(input.icon) ? input.icon : null;

  const { data: maxRow } = await supabase
    .from("profile_links")
    .select("sort_order")
    .eq("profile_id", profileId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data, error } = await supabase
    .from("profile_links")
    .insert({ profile_id: profileId, title, url, icon, sort_order: (maxRow?.sort_order ?? -1) + 1 })
    .select("id")
    .single();

  if (error || !data) {
    console.error("[smartcard-admin] Error creando profile_link:", error?.message);
    return { ok: false, error: "No se pudo guardar el link. Intenta de nuevo." };
  }
  return { ok: true, data: { id: data.id as string } };
}

export async function deleteSmartcardAdminProfileLink(linkId: string): Promise<SmartcardAdminResult<null>> {
  const supabase = getSmartcardAdminClient();
  if (!supabase) return { ok: false, error: "SmartCard aún no está configurado en este entorno." };
  const { error } = await supabase.from("profile_links").delete().eq("id", linkId);
  if (error) {
    console.error("[smartcard-admin] Error eliminando profile_link:", error.message);
    return { ok: false, error: "No se pudo eliminar el link. Intenta de nuevo." };
  }
  return { ok: true, data: null };
}

export async function toggleSmartcardAdminProfileLink(linkId: string, nextActive: boolean): Promise<SmartcardAdminResult<null>> {
  const supabase = getSmartcardAdminClient();
  if (!supabase) return { ok: false, error: "SmartCard aún no está configurado en este entorno." };
  const { error } = await supabase.from("profile_links").update({ is_active: nextActive }).eq("id", linkId);
  if (error) {
    console.error("[smartcard-admin] Error activando/desactivando profile_link:", error.message);
    return { ok: false, error: "No se pudo guardar el cambio. Intenta de nuevo." };
  }
  return { ok: true, data: null };
}

export async function updateSmartcardAdminProfileLinkIcon(linkId: string, icon: string | null): Promise<SmartcardAdminResult<null>> {
  const supabase = getSmartcardAdminClient();
  if (!supabase) return { ok: false, error: "SmartCard aún no está configurado en este entorno." };
  const safeIcon = icon && isValidLinkIcon(icon) ? icon : null;
  const { error } = await supabase.from("profile_links").update({ icon: safeIcon }).eq("id", linkId);
  if (error) {
    console.error("[smartcard-admin] Error actualizando ícono de profile_link:", error.message);
    return { ok: false, error: "No se pudo guardar el cambio. Intenta de nuevo." };
  }
  return { ok: true, data: null };
}

/** Intercambia sort_order entre un link y su vecino — mismo mecanismo que
 * admin.reymen.mx's moveProfileLinkAction (swap, no reescribir toda la lista). */
export async function moveSmartcardAdminProfileLink(
  profileId: string,
  linkId: string,
  direction: "up" | "down"
): Promise<SmartcardAdminResult<null>> {
  const supabase = getSmartcardAdminClient();
  if (!supabase) return { ok: false, error: "SmartCard aún no está configurado en este entorno." };

  const { data: links, error } = await supabase
    .from("profile_links")
    .select("id, sort_order")
    .eq("profile_id", profileId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error || !links) {
    console.error("[smartcard-admin] Error leyendo profile_links para reordenar:", error?.message);
    return { ok: false, error: "No se pudo reordenar. Intenta de nuevo." };
  }

  const index = links.findIndex((l) => l.id === linkId);
  const swapIndex = direction === "up" ? index - 1 : index + 1;
  if (index === -1 || swapIndex < 0 || swapIndex >= links.length) return { ok: true, data: null };

  const current = links[index];
  const neighbor = links[swapIndex];
  const [{ error: e1 }, { error: e2 }] = await Promise.all([
    supabase.from("profile_links").update({ sort_order: neighbor.sort_order }).eq("id", current.id),
    supabase.from("profile_links").update({ sort_order: current.sort_order }).eq("id", neighbor.id),
  ]);
  if (e1 || e2) {
    console.error("[smartcard-admin] Error reordenando profile_links:", e1?.message, e2?.message);
    return { ok: false, error: "No se pudo reordenar. Intenta de nuevo." };
  }
  return { ok: true, data: null };
}

/**
 * --- Empresas (companies) ---
 *
 * Fase 2: portado de admin.reymen.mx's apps/admin/app/companies — por
 * diseño de ESE panel (no una limitación nuestra) dar de alta una company
 * completa (company + primer usuario + módulos) sigue siendo manual por SQL
 * Editor (ver el comentario de companies/page.tsx: "el alta completa...
 * sigue pendiente"), así que aquí tampoco hay un companies/new — solo
 * listar/editar las que ya existen.
 *
 * El vínculo SSO con Reymen (companies.external_org_id) se muestra aquí
 * pero de SOLO LECTURA — cambiarlo vive a propósito en un solo lugar:
 * smartcard-link.ts/SmartcardLinkPanel.tsx, desde el detalle de la
 * Organization en /admin/clients/[id]. admin.reymen.mx's propia pantalla
 * (setExternalOrgIdAction) edita ese campo con una caja de texto libre para
 * el organizationId — correcto allá porque es el único panel con el que
 * cuenta, pero redundante y más riesgoso aquí, donde ya existe un flujo con
 * validación (no robarle la company a otro cliente, revertir si falla) en
 * vez de pegar un cuid a mano.
 */

export interface SmartcardCompanyAdminRow {
  id: string;
  name: string;
  slug: string;
  industry: string | null;
  status: string;
  planName: string | null;
  linkedOrgId: string | null;
  linkedOrgName: string | null;
}

async function attachOrgNames(
  companies: { id: string; external_org_id: string | null }[]
): Promise<Map<string, string | null>> {
  const orgIds = [...new Set(companies.map((c) => c.external_org_id).filter((v): v is string => !!v))];
  if (!orgIds.length) return new Map();
  const orgs = await prisma.organization.findMany({ where: { id: { in: orgIds } }, select: { id: true, name: true } });
  return new Map(orgs.map((o: { id: string; name: string }) => [o.id, o.name]));
}

export async function listSmartcardCompaniesAdmin(search?: string): Promise<SmartcardCompanyAdminRow[] | null> {
  const supabase = getSmartcardAdminClient();
  if (!supabase) return null;

  let query = supabase
    .from("companies")
    .select("id, name, slug, industry, status, current_plan_id, external_org_id")
    .order("created_at", { ascending: false });

  const term = search ? sanitizeSearchTerm(search) : "";
  if (term) query = query.or(`name.ilike.%${term}%,slug.ilike.%${term}%`);

  const { data, error } = await query;
  if (error) {
    console.error("[smartcard-admin] Error listando companies:", error.message);
    return null;
  }
  if (!data?.length) return [];

  const planIds = [...new Set(data.map((c) => c.current_plan_id as string | null).filter((v): v is string => !!v))];
  const planNameById = new Map<string, string>();
  if (planIds.length) {
    const { data: plans } = await supabase.from("plans").select("id, name").in("id", planIds);
    for (const p of plans ?? []) planNameById.set(p.id as string, p.name as string);
  }

  const orgNameByOrgId = await attachOrgNames(
    data.map((c) => ({ id: c.id as string, external_org_id: c.external_org_id as string | null }))
  );

  return data.map((c) => ({
    id: c.id as string,
    name: c.name as string,
    slug: c.slug as string,
    industry: c.industry as string | null,
    status: c.status as string,
    planName: c.current_plan_id ? (planNameById.get(c.current_plan_id as string) ?? null) : null,
    linkedOrgId: c.external_org_id as string | null,
    linkedOrgName: c.external_org_id ? (orgNameByOrgId.get(c.external_org_id as string) ?? null) : null,
  }));
}

export interface SmartcardCompanyAdminDetail {
  id: string;
  name: string;
  slug: string;
  industry: string | null;
  status: string;
  billingEmail: string | null;
  timezone: string;
  planName: string | null;
  linkedOrgId: string | null;
  linkedOrgName: string | null;
  createdAt: string;
}

export async function getSmartcardCompanyAdminDetail(id: string): Promise<SmartcardCompanyAdminDetail | null> {
  const supabase = getSmartcardAdminClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("companies")
    .select("id, name, slug, industry, status, billing_email, timezone, current_plan_id, external_org_id, created_at")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("[smartcard-admin] Error buscando company:", error.message);
    return null;
  }
  if (!data) return null;

  const [{ data: plan }, orgNameByOrgId] = await Promise.all([
    data.current_plan_id
      ? supabase.from("plans").select("name").eq("id", data.current_plan_id as string).maybeSingle()
      : Promise.resolve({ data: null as { name: string } | null }),
    attachOrgNames([{ id: data.id as string, external_org_id: data.external_org_id as string | null }]),
  ]);

  return {
    id: data.id as string,
    name: data.name as string,
    slug: data.slug as string,
    industry: data.industry as string | null,
    status: data.status as string,
    billingEmail: data.billing_email as string | null,
    timezone: data.timezone as string,
    planName: plan?.name ?? null,
    linkedOrgId: data.external_org_id as string | null,
    linkedOrgName: data.external_org_id ? (orgNameByOrgId.get(data.external_org_id as string) ?? null) : null,
    createdAt: data.created_at as string,
  };
}

export interface SmartcardCompanyAdminInput {
  name: string;
  slug: string;
  industry: string | null;
  billingEmail: string | null;
  timezone: string;
  status: string;
}

export async function updateSmartcardCompanyAdmin(
  id: string,
  input: SmartcardCompanyAdminInput
): Promise<SmartcardAdminResult<null>> {
  const supabase = getSmartcardAdminClient();
  if (!supabase) return { ok: false, error: "SmartCard aún no está configurado en este entorno." };

  const name = input.name.trim();
  const slug = input.slug.trim();
  if (!name) return { ok: false, error: "El nombre es obligatorio." };
  if (!slug) return { ok: false, error: "El slug es obligatorio." };

  // external_org_id deliberadamente no se toca aquí — ver el comentario de
  // esta sección y setExternalOrgIdAction en admin.reymen.mx.
  const { error } = await supabase
    .from("companies")
    .update({
      name,
      slug,
      industry: input.industry?.trim() || null,
      billing_email: input.billingEmail?.trim() || null,
      timezone: input.timezone.trim() || "America/Mexico_City",
      status: input.status,
    })
    .eq("id", id);

  if (error) {
    if (error.code === "23505") return { ok: false, error: "Ese slug ya lo usa otra empresa." };
    console.error("[smartcard-admin] Error actualizando company:", error.message);
    return { ok: false, error: "No se pudo guardar el cambio. Intenta de nuevo." };
  }
  return { ok: true, data: null };
}

export interface SmartcardCompanyUserRow {
  userId: string;
  email: string | null;
  roleName: string | null;
  roleCode: string | null;
  status: string;
}

/** Roster de company_users con el correo resuelto vía Supabase Auth — mismo
 * mecanismo que getSmartcardLinkState (smartcard-link.ts), aquí sin acotar
 * por organizationId (cualquier company, no solo la ya vinculada a un
 * cliente de Reymen). */
export async function listSmartcardCompanyUsersAdmin(companyId: string): Promise<SmartcardCompanyUserRow[]> {
  const supabase = getSmartcardAdminClient();
  if (!supabase) return [];

  const { data: rows, error } = await supabase
    .from("company_users")
    .select("user_id, status, roles(code, name)")
    .eq("company_id", companyId);

  if (error) {
    console.error("[smartcard-admin] Error listando company_users:", error.message);
    return [];
  }

  return Promise.all(
    (rows ?? []).map(async (r) => {
      const { data } = await supabase.auth.admin.getUserById(r.user_id as string);
      const role = r.roles as unknown as { code?: string; name?: string } | null;
      return {
        userId: r.user_id as string,
        email: data?.user?.email ?? null,
        roleName: role?.name ?? null,
        roleCode: role?.code ?? null,
        status: r.status as string,
      };
    })
  );
}

/**
 * --- Catálogos (Fase 3): temas, tipos de destino, slugs reservados ---
 *
 * Portado de admin.reymen.mx's /settings — ahí los 3 catálogos son
 * visibles para los 3 roles pero editables solo por SUPERADMIN (misma regla
 * que las policies de RLS ya aplican, ver el comentario original de esa
 * pantalla); las Server Actions que envuelven estas funciones aplican el
 * mismo corte (requireAdmin para ver, SUPER_ADMIN para cualquier escritura).
 */

// --- Temas ---

export interface SmartcardThemeAdminRow {
  id: string;
  name: string;
  slug: string;
  fields: ThemeConfigFields;
  isActive: boolean;
}

export async function listSmartcardThemesAdmin(): Promise<SmartcardThemeAdminRow[] | null> {
  const supabase = getSmartcardAdminClient();
  if (!supabase) return null;
  const { data, error } = await supabase.from("themes").select("id, name, slug, config, is_active").order("name");
  if (error) {
    console.error("[smartcard-admin] Error listando themes:", error.message);
    return null;
  }
  return (data ?? []).map((t) => ({
    id: t.id as string,
    name: t.name as string,
    slug: t.slug as string,
    fields: parseThemeConfig(t.config),
    isActive: t.is_active as boolean,
  }));
}

export async function getSmartcardThemeAdmin(id: string): Promise<SmartcardThemeAdminRow | null> {
  const supabase = getSmartcardAdminClient();
  if (!supabase) return null;
  const { data, error } = await supabase.from("themes").select("id, name, slug, config, is_active").eq("id", id).maybeSingle();
  if (error) {
    console.error("[smartcard-admin] Error buscando theme:", error.message);
    return null;
  }
  if (!data) return null;
  return {
    id: data.id as string,
    name: data.name as string,
    slug: data.slug as string,
    fields: parseThemeConfig(data.config),
    isActive: data.is_active as boolean,
  };
}

export interface SmartcardThemeInput {
  name: string;
  slug: string;
  fields: ThemeConfigFields;
}

export async function createSmartcardTheme(input: SmartcardThemeInput): Promise<SmartcardAdminResult> {
  const supabase = getSmartcardAdminClient();
  if (!supabase) return { ok: false, error: "SmartCard aún no está configurado en este entorno." };

  const name = input.name.trim();
  const slug = input.slug.trim().toLowerCase();
  if (!name || !slug) return { ok: false, error: "El nombre y el slug son obligatorios." };

  const config = buildThemeConfig(input.fields);
  if (!config) return { ok: false, error: "La configuración del tema no es válida." };

  const { data, error } = await supabase.from("themes").insert({ name, slug, config }).select("id").single();
  if (error || !data) {
    if (error?.code === "23505") return { ok: false, error: "Ese slug ya lo usa otro tema." };
    console.error("[smartcard-admin] Error creando theme:", error?.message);
    return { ok: false, error: "No se pudo guardar el tema. Intenta de nuevo." };
  }
  return { ok: true, data: { id: data.id as string } };
}

export async function updateSmartcardTheme(
  id: string,
  input: SmartcardThemeInput & { isActive: boolean }
): Promise<SmartcardAdminResult<null>> {
  const supabase = getSmartcardAdminClient();
  if (!supabase) return { ok: false, error: "SmartCard aún no está configurado en este entorno." };

  const name = input.name.trim();
  const slug = input.slug.trim().toLowerCase();
  if (!name || !slug) return { ok: false, error: "El nombre y el slug son obligatorios." };

  const config = buildThemeConfig(input.fields);
  if (!config) return { ok: false, error: "La configuración del tema no es válida." };

  const { error } = await supabase.from("themes").update({ name, slug, config, is_active: input.isActive }).eq("id", id);
  if (error) {
    if (error.code === "23505") return { ok: false, error: "Ese slug ya lo usa otro tema." };
    console.error("[smartcard-admin] Error actualizando theme:", error.message);
    return { ok: false, error: "No se pudo guardar el tema. Intenta de nuevo." };
  }
  return { ok: true, data: null };
}

// --- Tipos de destino ---

export interface SmartcardDestinationTypeAdminRow {
  code: string;
  label: string;
  requiresProfile: boolean;
  requiresUrl: boolean;
  sortOrder: number;
  isActive: boolean;
}

export async function listSmartcardDestinationTypesAdmin(): Promise<SmartcardDestinationTypeAdminRow[] | null> {
  const supabase = getSmartcardAdminClient();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("destination_types")
    .select("code, label, requires_profile, requires_url, sort_order, is_active")
    .order("sort_order");
  if (error) {
    console.error("[smartcard-admin] Error listando destination_types:", error.message);
    return null;
  }
  return (data ?? []).map((d) => ({
    code: d.code as string,
    label: d.label as string,
    requiresProfile: d.requires_profile as boolean,
    requiresUrl: d.requires_url as boolean,
    sortOrder: d.sort_order as number,
    isActive: d.is_active as boolean,
  }));
}

const DESTINATION_TYPE_CODE_FORMAT = /^[A-Z0-9_]+$/;

/**
 * Nota deliberada (igual que admin.reymen.mx): requires_profile/requires_url
 * de un tipo YA existente no se editan aquí — son los que lee
 * validate_card_destination() para decidir qué campo exige cada tarjeta que
 * ya usa ese tipo; cambiarlos con tarjetas existentes podría dejarlas en un
 * estado que el trigger ya no aceptaría. label/is_active/sort_order sí son
 * seguros en cualquier momento; para una regla de validación distinta, dar
 * de alta un tipo nuevo es la vía segura.
 */
export async function createSmartcardDestinationType(input: {
  code: string;
  label: string;
  requiresProfile: boolean;
  requiresUrl: boolean;
  sortOrder: number;
}): Promise<SmartcardAdminResult<null>> {
  const supabase = getSmartcardAdminClient();
  if (!supabase) return { ok: false, error: "SmartCard aún no está configurado en este entorno." };

  const code = input.code.trim().toUpperCase();
  const label = input.label.trim();
  if (!code || !label) return { ok: false, error: "Faltan campos obligatorios." };
  if (!DESTINATION_TYPE_CODE_FORMAT.test(code)) {
    return { ok: false, error: "El código debe ser MAYÚSCULAS, números y guion bajo (ej. GOOGLE_REVIEWS)." };
  }

  const { error } = await supabase.from("destination_types").insert({
    code,
    label,
    requires_profile: input.requiresProfile,
    requires_url: input.requiresUrl,
    sort_order: input.sortOrder,
  });
  if (error) {
    if (error.code === "23505") return { ok: false, error: "Ya existe un tipo de destino con ese código." };
    console.error("[smartcard-admin] Error creando destination_type:", error.message);
    return { ok: false, error: "No se pudo guardar el cambio. Intenta de nuevo." };
  }
  return { ok: true, data: null };
}

export async function updateSmartcardDestinationTypeLabel(code: string, label: string): Promise<SmartcardAdminResult<null>> {
  const supabase = getSmartcardAdminClient();
  if (!supabase) return { ok: false, error: "SmartCard aún no está configurado en este entorno." };
  const trimmed = label.trim();
  if (!trimmed) return { ok: false, error: "Faltan campos obligatorios." };

  const { error } = await supabase.from("destination_types").update({ label: trimmed }).eq("code", code);
  if (error) {
    console.error("[smartcard-admin] Error actualizando destination_type:", error.message);
    return { ok: false, error: "No se pudo guardar el cambio. Intenta de nuevo." };
  }
  return { ok: true, data: null };
}

export async function toggleSmartcardDestinationType(code: string, nextActive: boolean): Promise<SmartcardAdminResult<null>> {
  const supabase = getSmartcardAdminClient();
  if (!supabase) return { ok: false, error: "SmartCard aún no está configurado en este entorno." };
  const { error } = await supabase.from("destination_types").update({ is_active: nextActive }).eq("code", code);
  if (error) {
    console.error("[smartcard-admin] Error activando/desactivando destination_type:", error.message);
    return { ok: false, error: "No se pudo guardar el cambio. Intenta de nuevo." };
  }
  return { ok: true, data: null };
}

// --- Slugs reservados ---

const RESERVED_SLUG_FORMAT = /^[a-z0-9][a-z0-9_.-]*$/;

export async function listSmartcardReservedSlugs(): Promise<string[] | null> {
  const supabase = getSmartcardAdminClient();
  if (!supabase) return null;
  const { data, error } = await supabase.from("reserved_slugs").select("slug").order("slug");
  if (error) {
    console.error("[smartcard-admin] Error listando reserved_slugs:", error.message);
    return null;
  }
  return (data ?? []).map((r) => r.slug as string);
}

export async function addSmartcardReservedSlug(slug: string): Promise<SmartcardAdminResult<null>> {
  const supabase = getSmartcardAdminClient();
  if (!supabase) return { ok: false, error: "SmartCard aún no está configurado en este entorno." };
  const normalized = slug.trim().toLowerCase();
  if (!normalized) return { ok: false, error: "Faltan campos obligatorios." };
  if (!RESERVED_SLUG_FORMAT.test(normalized)) {
    return { ok: false, error: "Ese slug no es válido: usa minúsculas, números, guiones o puntos." };
  }

  const { error } = await supabase.from("reserved_slugs").insert({ slug: normalized });
  if (error) {
    if (error.code === "23505") return { ok: false, error: "Ese slug ya está en la lista de reservados." };
    console.error("[smartcard-admin] Error agregando reserved_slug:", error.message);
    return { ok: false, error: "No se pudo guardar el cambio. Intenta de nuevo." };
  }
  return { ok: true, data: null };
}

export async function deleteSmartcardReservedSlug(slug: string): Promise<SmartcardAdminResult<null>> {
  const supabase = getSmartcardAdminClient();
  if (!supabase) return { ok: false, error: "SmartCard aún no está configurado en este entorno." };
  const { error } = await supabase.from("reserved_slugs").delete().eq("slug", slug);
  if (error) {
    console.error("[smartcard-admin] Error eliminando reserved_slug:", error.message);
    return { ok: false, error: "No se pudo guardar el cambio. Intenta de nuevo." };
  }
  return { ok: true, data: null };
}
