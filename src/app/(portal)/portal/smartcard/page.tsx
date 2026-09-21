import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { requireModule } from "@/lib/modules";
import { resolveSmartcardMembership, getCompanyRoster, getCompanyCardStats } from "@/lib/smartcard-company";
import { SmartcardPanel } from "@/components/portal/SmartcardPanel";

const FAILURE_MESSAGES: Record<string, string> = {
  not_configured: "SmartCard aún no está configurado en este entorno. Contacta a soporte.",
  no_company: "Tu empresa todavía no está vinculada con SmartCard. Contacta a soporte de Reymen.",
  no_membership:
    "Tu cuenta todavía no es miembro activo de la empresa vinculada en SmartCard. Contacta a soporte de Reymen.",
  query_failed: "No se pudo cargar SmartCard en este momento. Intenta de nuevo en unos minutos.",
};

/**
 * Was a redirect to reymen-smartcard's own ops.reymen.mx via a signed SSO
 * hand-off token (see git history / smartcard-sso.ts) — that bridge still
 * exists and still works (createSmartcardSsoToken is unused now but kept,
 * not deleted, in case a future need for the standalone ops.reymen.mx login
 * comes back), but bouncing between two separate domains with two separate
 * page shells for what is, today, just "which modules does this company
 * have" and "who's on the team" wasn't worth the round trip. This page
 * renders that same data natively, reading reymen-smartcard's own Supabase
 * project directly (smartcard-company.ts) instead of redirecting to it.
 */
export default async function SmartcardPage() {
  const session = await auth();
  if (!session?.user.organizationId || !session.user.email) redirect("/login");

  // requireModule() redirects to /portal/dashboard by itself when NFC_QR
  // isn't enabled for this org — same guard the page always had.
  await requireModule(session.user.organizationId, "NFC_QR");

  const result = await resolveSmartcardMembership(session.user.organizationId, session.user.email);

  if (!result.ok) {
    return (
      <main className="mx-auto max-w-3xl p-8">
        <h1 className="text-2xl font-semibold">SmartCard</h1>
        <p className="mt-4 rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {FAILURE_MESSAGES[result.reason]}
        </p>
      </main>
    );
  }

  const [roster, cardStats] = await Promise.all([
    getCompanyRoster(result.membership.companyId, result.membership.userId),
    getCompanyCardStats(result.membership.companyId),
  ]);

  return (
    <SmartcardPanel
      membership={result.membership}
      roster={roster}
      cardStats={cardStats}
      currentUserEmail={session.user.email}
    />
  );
}
