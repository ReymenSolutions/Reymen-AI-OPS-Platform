import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/lib/auth.config";

// Middleware runs on every request, so it uses the edge-safe config alone
// (no Credentials provider, no PrismaAdapter) instead of importing the full
// auth() from @/lib/auth — that would pull bcrypt, the Prisma client and
// otpauth into the middleware bundle for no reason, since middleware only
// ever reads the already-issued JWT, it never signs in.
const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const session = req.auth;

  const isAuthPage =
    pathname.startsWith("/login") ||
    pathname.startsWith("/forgot-password") ||
    pathname.startsWith("/reset-password");
  const isAdminRoute = pathname.startsWith("/admin");
  const isPortalRoute = pathname.startsWith("/portal");
  const isWebhookRoute = pathname.startsWith("/api/webhooks");
  const isAuthApiRoute = pathname.startsWith("/api/auth");
  const isCronRoute = pathname.startsWith("/api/cron");
  const isHealthRoute = pathname.startsWith("/api/health");

  // Public routes — webhook and cron routes authenticate themselves
  // (HMAC signature / CRON_SECRET) rather than via session, and the
  // health check must be reachable by load balancers/uptime monitors
  // without a session
  if (isAuthPage || isWebhookRoute || isAuthApiRoute || isCronRoute || isHealthRoute) {
    return NextResponse.next();
  }

  // No session → redirect to login
  if (!session) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const role = session.user.role;

  // Admin routes require SUPER_ADMIN or ADMIN
  if (isAdminRoute && role !== "SUPER_ADMIN" && role !== "ADMIN") {
    return NextResponse.redirect(new URL("/portal/dashboard", req.url));
  }

  // Portal routes require an organization (or an active impersonation)
  if (isPortalRoute && !session.user.organizationId) {
    const impersonateCookie = req.cookies.get("reymen-impersonate");
    if (impersonateCookie?.value) {
      try {
        const imp = JSON.parse(impersonateCookie.value) as { adminId: string; targetOrgId: string };
        if (imp.adminId === session.user.id && imp.targetOrgId) {
          return NextResponse.next();
        }
      } catch {}
    }
    return NextResponse.redirect(new URL("/login", req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|public).*)",
  ],
};
