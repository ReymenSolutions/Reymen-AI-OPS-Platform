import { prisma } from "./prisma";
import { sendEmail, type SendEmailInput } from "./email";

/** Fire-and-forget notifies every active platform admin (SUPER_ADMIN/ADMIN) by email. */
export async function notifyAdmins(email: Omit<SendEmailInput, "to">): Promise<void> {
  const admins = await prisma.user.findMany({
    where: { role: { in: ["SUPER_ADMIN", "ADMIN"] }, isActive: true },
    select: { email: true },
  });

  await Promise.all(
    admins.map((admin) => sendEmail({ ...email, to: admin.email }).catch(() => {}))
  );
}
