import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requireModule } from "@/lib/modules";
import { createSmartcardSsoToken } from "@/lib/smartcard-sso";

/**
 * `/portal/smartcard` isn't a page — it's the SSO hand-off. The
 * `PortalSidebar` "SmartCard" link points here; this route mints a
 * short-lived signed token (see `smartcard-sso.ts` for why) and bounces the
 * browser straight to the SmartCard product's own SSO endpoint, which signs
 * the person in there with no second password.
 */
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user.organizationId) {
    // Same base-URL pattern as middleware.ts's own redirects — built from
    // the incoming request itself, not an env var that might not match the
    // host actually serving this request.
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // requireModule() redirects to /portal/dashboard by itself when NFC_QR
  // isn't enabled — same guard every other module-gated portal page uses,
  // so a direct hit on this URL (not just the hidden sidebar link) is
  // covered too.
  await requireModule(session.user.organizationId, "NFC_QR");

  const secret = process.env.SMARTCARD_SSO_SECRET;
  const opsUrl = process.env.SMARTCARD_OPS_URL;
  if (!secret || !opsUrl) {
    // Module enabled but the bridge isn't configured yet in this
    // environment (e.g. Reymen turned NFC_QR on for an org before deploying
    // the SSO env vars) — fail with a page the person can understand rather
    // than a broken redirect to `undefined`.
    return NextResponse.json(
      { error: "SmartCard aún no está configurado en este entorno. Contacta a soporte." },
      { status: 503 }
    );
  }

  const token = createSmartcardSsoToken(session.user.organizationId, session.user.email!, secret);
  const target = new URL("/api/sso/smartcard", opsUrl);
  target.searchParams.set("token", token);

  return NextResponse.redirect(target);
}
