import { getSmartcardAdminClient } from "./smartcard-supabase";

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
