import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client for reading/writing the `reymen-smartcard`
 * product's own database directly — the SAME Supabase project that repo's
 * apps/ops and apps/admin already use (companies, company_users, roles,
 * modules, permissions, company_modules). This platform doesn't own that
 * data; it's now rendering it natively instead of bouncing the browser
 * through an SSO redirect to reymen-smartcard's own `ops.reymen.mx` (see
 * portal/smartcard/page.tsx for the history: that SSO bridge still exists
 * and still works, this is what replaced it as the primary path so a
 * SmartCard-enabled org never has to leave this app or log in twice).
 *
 * Service role bypasses that project's RLS entirely — exactly like
 * reymen-smartcard's own createAdminClient() does — so every query built on
 * top of this client (smartcard-company.ts, actions/portal/smartcard.ts)
 * MUST filter explicitly by companyId/userId. There is no RLS safety net
 * here the way there is for a session-scoped Supabase client; an unscoped
 * query on this client reads across every company in that project.
 *
 * SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY must point at that exact project
 * — same values as reymen-smartcard's apps/ops/.env.production
 * (NEXT_PUBLIC_SUPABASE_URL there; the NEXT_PUBLIC_ prefix doesn't apply
 * here since this app never needs a Supabase client in the browser).
 */
let cached: SupabaseClient | null = null;

export function getSmartcardAdminClient(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;

  if (!cached) {
    cached = createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return cached;
}
