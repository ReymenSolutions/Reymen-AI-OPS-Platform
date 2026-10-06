import Link from "next/link";
import { requireAdmin } from "@/lib/guards";
import { listSmartcardClientOptions, listSmartcardProfileOptions } from "@/lib/smartcard-admin";
import { getActiveDestinationTypes } from "@/lib/smartcard-company";
import { PageHeader } from "@/components/shared/PageHeader";
import { SmartcardCardForm } from "@/components/admin/SmartcardCardForm";

export default async function NewSmartcardCardPage({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string }>;
}) {
  await requireAdmin();
  const { clientId } = await searchParams;

  const [clients, destinationTypes, profiles] = await Promise.all([
    listSmartcardClientOptions(),
    getActiveDestinationTypes(),
    listSmartcardProfileOptions(),
  ]);

  return (
    <div>
      <Link href="/admin/smartcard/cards" className="mb-4 inline-block text-sm text-slate-500 hover:underline">
        ← Volver a tarjetas
      </Link>
      <PageHeader title="Nueva tarjeta" description="El código (REY-000001, etc.) se genera automáticamente al guardar." />

      <SmartcardCardForm
        clients={clients ?? []}
        destinationTypes={destinationTypes}
        profiles={profiles ?? []}
        lockClient={!!clientId}
        initial={
          clientId
            ? {
                clientId,
                destinationType: destinationTypes[0]?.code ?? "",
                profileId: null,
                destinationUrl: "",
                notes: "",
                status: "ACTIVE",
              }
            : undefined
        }
      />
    </div>
  );
}
