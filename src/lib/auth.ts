import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "./prisma";
import { checkRateLimit } from "./rate-limit";
import { verifyTotpCode } from "./totp";
import { authConfig } from "./auth.config";
export { isAdmin, isClientRole } from "./roles";

class RateLimitedSignin extends CredentialsSignin {
  code = "rate_limited";
}

class TwoFactorRequiredSignin extends CredentialsSignin {
  code = "totp_required";
}

class TwoFactorInvalidSignin extends CredentialsSignin {
  code = "totp_invalid";
}

async function consumeBackupCode(userId: string, code: string, hashes: string[]): Promise<boolean> {
  const normalized = code.trim().toUpperCase();
  for (const hash of hashes) {
    if (await bcrypt.compare(normalized, hash)) {
      await prisma.user.update({
        where: { id: userId },
        data: { totpBackupCodeHashes: hashes.filter((h) => h !== hash) },
      });
      return true;
    }
  }
  return false;
}

function clientIp(request?: Request): string | null {
  const forwarded = request?.headers.get("x-forwarded-for");
  return forwarded ? forwarded.split(",")[0].trim() : null;
}

// A precomputed bcrypt hash with no matching plaintext. Compared against
// when the user doesn't exist (or has no password set) so that
// bcrypt.compare() always runs — otherwise "no such user" returns
// immediately while "wrong password" takes ~bcrypt's full cost-12 runtime,
// letting an attacker time responses to enumerate registered emails.
const DUMMY_PASSWORD_HASH = "$2b$12$0APBnsAoVXPA3KuUG55K3e//22j27ckpDNZu8LeeyOJ9lzBQPbi8e";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  totpCode: z.string().optional(),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        totpCode: { label: "Authenticator code", type: "text" },
      },
      async authorize(credentials, request) {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const { email, password } = parsed.data;
        // URLSearchParams (used by the client signIn() call) stringifies an
        // omitted/undefined field as the literal text "undefined" — treat
        // that the same as "no code provided".
        const totpCode =
          parsed.data.totpCode && parsed.data.totpCode !== "undefined" ? parsed.data.totpCode : undefined;

        const ip = clientIp(request);
        const [emailLimit, ipLimit] = await Promise.all([
          checkRateLimit(`login:email:${email.toLowerCase()}`, { limit: 5, windowMs: 10 * 60 * 1000 }),
          ip
            ? checkRateLimit(`login:ip:${ip}`, { limit: 20, windowMs: 10 * 60 * 1000 })
            : Promise.resolve({ allowed: true }),
        ]);
        if (!emailLimit.allowed || !ipLimit.allowed) throw new RateLimitedSignin();

        const user = await prisma.user.findUnique({
          where: { email, isActive: true },
          include: { organization: { select: { isActive: true } } },
        });

        // Always run bcrypt.compare, even for a nonexistent user or a
        // suspended org, against a dummy hash — otherwise those cases
        // return near-instantly while a real "wrong password" takes
        // bcrypt's full runtime, letting response timing reveal which
        // emails are registered.
        const orgSuspended = !!user?.organizationId && user.organization?.isActive === false;
        const isValid = await bcrypt.compare(
          password,
          user?.passwordHash && !orgSuspended ? user.passwordHash : DUMMY_PASSWORD_HASH
        );
        if (!user || !user.passwordHash || orgSuspended || !isValid) return null;

        if (user.totpEnabled) {
          if (!totpCode) throw new TwoFactorRequiredSignin();

          const validTotp = user.totpSecret ? verifyTotpCode(user.totpSecret, totpCode) : false;
          const validBackup =
            !validTotp && (await consumeBackupCode(user.id, totpCode, user.totpBackupCodeHashes));
          if (!validTotp && !validBackup) throw new TwoFactorInvalidSignin();
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
          role: user.role,
          organizationId: user.organizationId,
          theme: user.theme,
          language: user.language,
        };
      },
    }),
  ],
});
