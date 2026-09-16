"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import type { AppointmentStatus } from "@prisma/client";

// Only these statuses represent a live, upcoming commitment that occupies a
// slot. A CANCELLED or NO_SHOW appointment frees the slot back up; COMPLETED
// only ever applies to a slot already in the past, so it never conflicts
// with a new booking in practice, but is excluded on the same logic as
// CANCELLED/NO_SHOW: it's not something a new booking needs to avoid.
const BLOCKING_STATUSES: AppointmentStatus[] = ["SCHEDULED", "CONFIRMED"];

const createSchema = z.object({
  title: z.string().min(2),
  description: z.string().optional(),
  startTime: z.string().min(1),
  endTime: z.string().min(1),
});

export async function createAppointment(data: z.infer<typeof createSchema>) {
  const session = await auth();
  if (!session?.user.organizationId) throw new Error("No autorizado");

  const parsed = createSchema.safeParse(data);
  if (!parsed.success) throw new Error(parsed.error.errors[0]?.message ?? "Datos inválidos");

  const start = new Date(parsed.data.startTime);
  const end = new Date(parsed.data.endTime);
  if (end <= start) throw new Error("La hora de fin debe ser posterior a la de inicio");

  const organizationId = session.user.organizationId;

  try {
    await prisma.$transaction(
      async (tx) => {
        // Overlap check: two ranges [startTime, endTime) conflict when
        // existing.startTime < newEnd AND existing.endTime > newStart.
        const overlapping = await tx.appointment.findFirst({
          where: {
            organizationId,
            status: { in: BLOCKING_STATUSES },
            startTime: { lt: end },
            endTime: { gt: start },
          },
          select: { id: true },
        });
        if (overlapping) throw new Error("Ese horario ya está ocupado por otra cita.");

        await tx.appointment.create({
          data: {
            organizationId,
            title: parsed.data.title,
            description: parsed.data.description,
            startTime: start,
            endTime: end,
            source: "manual",
          },
        });
      },
      // Read Committed (Postgres's default) lets two concurrent transactions
      // both pass the overlap check above before either commits — a classic
      // check-then-act race that would double-book the slot. Serializable
      // makes Postgres itself detect that conflict and abort one of the two
      // transactions instead, which we surface as the same "slot taken" error.
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2034") {
      throw new Error("Ese horario ya está ocupado por otra cita.");
    }
    throw err;
  }

  revalidatePath("/portal/appointments");
  return { success: true };
}

export async function updateAppointmentStatus(appointmentId: string, status: AppointmentStatus) {
  const session = await auth();
  if (!session?.user.organizationId) throw new Error("No autorizado");

  const apt = await prisma.appointment.findFirst({
    where: { id: appointmentId, organizationId: session.user.organizationId },
  });
  if (!apt) throw new Error("Cita no encontrada");

  await prisma.appointment.update({
    where: { id: appointmentId },
    data: { status },
  });

  revalidatePath("/portal/appointments");
  return { success: true };
}
