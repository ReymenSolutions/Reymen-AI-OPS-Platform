import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Toaster } from "sonner";
import { SessionProvider } from "next-auth/react";
import { cookies } from "next/headers";
import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";
import { PreferencesProvider } from "@/context/preferences";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Reymen AI Ops Platform",
  description: "Automatización inteligente para hacer crecer tu negocio.",
};

// Edge-safe auth() (same pattern as middleware.ts) — this only needs to
// decode the already-issued JWT for its theme/language claims, not sign in,
// so it skips the Credentials provider and PrismaAdapter that the full
// @/lib/auth pulls in.
const { auth } = NextAuth(authConfig);

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Prefer the value carried on the session (set from the User row at login,
  // kept in sync by updatePreferences()'s "update" trigger) so preferences
  // follow the account across devices and survive a fresh login even when
  // the reymen-theme/reymen-lang cookies were never set (new browser,
  // cleared cookies, etc). Cookies are the fallback for logged-out pages,
  // where there's no session to read from yet.
  const session = await auth().catch(() => null);
  const store = await cookies();

  const initialLang = session?.user
    ? (session.user.language === "en" ? "en" : "es")
    : (store.get("reymen-lang")?.value === "en" ? "en" : "es");
  const initialTheme = session?.user
    ? (session.user.theme === "dark" ? "dark" : "light")
    : (store.get("reymen-theme")?.value === "dark" ? "dark" : "light");

  return (
    <html lang={initialLang} className={initialTheme === "dark" ? "dark" : ""}>
      <body className={`${inter.className} antialiased bg-slate-50`}>
        <SessionProvider>
          <PreferencesProvider initialTheme={initialTheme} initialLang={initialLang}>
            {children}
            <Toaster position="top-right" richColors />
          </PreferencesProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
