"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { UserError } from "@/lib/user-error";

/** Explicit opt-out — an org can be marked done without every checklist step being complete. */
export async function skipOnboarding() {
  const session = await auth();
  if (!session?.user.organizationId) throw new UserError("No autorizado");

  await prisma.organization.update({
    where: { id: session.user.organizationId },
    data: { onboardingCompletedAt: new Date() },
  });

  revalidatePath("/portal/onboarding");
  revalidatePath("/portal/dashboard");
  return { success: true };
}
