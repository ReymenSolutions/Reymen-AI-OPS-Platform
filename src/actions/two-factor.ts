"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import QRCode from "qrcode";
import { prisma } from "@/lib/prisma";
import { auth, isAdmin } from "@/lib/auth";
import { generateTotpSecret, buildOtpauthUri, verifyTotpCode, generateBackupCodes } from "@/lib/totp";
import { logAudit } from "@/lib/audit";

async function requireAdminSession() {
  const session = await auth();
  if (!session || !isAdmin(session.user.role)) throw new Error("No autorizado");
  return session;
}

/**
 * Begins enrollment: generates and stores a new secret (2FA stays OFF until
 * confirm2FAEnrollment verifies a code against it), and returns everything
 * needed to render the QR code / manual entry key.
 */
export async function start2FAEnrollment(): Promise<{ qrCodeDataUrl: string; secret: string }> {
  const session = await requireAdminSession();

  const secret = generateTotpSecret();
  await prisma.user.update({
    where: { id: session.user.id },
    data: { totpSecret: secret, totpEnabled: false, totpBackupCodeHashes: [] },
  });

  const otpauthUri = buildOtpauthUri(secret, session.user.email ?? "admin");
  const qrCodeDataUrl = await QRCode.toDataURL(otpauthUri);

  return { qrCodeDataUrl, secret };
}

/**
 * Verifies the first code from the authenticator app and turns 2FA on.
 * Returns the plaintext backup codes exactly once — only their bcrypt
 * hashes are ever persisted.
 */
export async function confirm2FAEnrollment(code: string): Promise<{ backupCodes: string[] }> {
  const session = await requireAdminSession();

  const user = await prisma.user.findUniqueOrThrow({ where: { id: session.user.id } });
  if (!user.totpSecret) throw new Error("No hay una configuración de 2FA en progreso");
  if (!verifyTotpCode(user.totpSecret, code)) throw new Error("Código inválido");

  const backupCodes = generateBackupCodes();
  const totpBackupCodeHashes = await Promise.all(backupCodes.map((c) => bcrypt.hash(c, 10)));

  await prisma.user.update({
    where: { id: session.user.id },
    data: { totpEnabled: true, totpBackupCodeHashes },
  });

  await logAudit({
    userId: session.user.id,
    action: "auth.2fa_enabled",
    resource: "User",
    resourceId: session.user.id,
  });

  revalidatePath("/admin/settings");
  return { backupCodes };
}

export async function disable2FA(password: string): Promise<{ success: true }> {
  const session = await requireAdminSession();

  const user = await prisma.user.findUniqueOrThrow({ where: { id: session.user.id } });
  if (!user.passwordHash || !(await bcrypt.compare(password, user.passwordHash))) {
    throw new Error("Contraseña incorrecta");
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: { totpEnabled: false, totpSecret: null, totpBackupCodeHashes: [] },
  });

  await logAudit({
    userId: session.user.id,
    action: "auth.2fa_disabled",
    resource: "User",
    resourceId: session.user.id,
  });

  revalidatePath("/admin/settings");
  return { success: true };
}

export async function get2FAStatus(): Promise<{ enabled: boolean; remainingBackupCodes: number }> {
  const session = await requireAdminSession();
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: session.user.id },
    select: { totpEnabled: true, totpBackupCodeHashes: true },
  });
  return { enabled: user.totpEnabled, remainingBackupCodes: user.totpBackupCodeHashes.length };
}
