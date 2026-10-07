import Link from "next/link";
import { requireAdmin } from "@/lib/guards";
import { listSmartcardThemes, listSmartcardClientOptions } from "@/lib/smartcard-admin";
import { PageHeader } from "@/components/shared/PageHeader";
import { SmartcardProfileForm } from "@/components/admin/SmartcardProfileForm";

export default async function NewSmartcardProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string }>;
}) {
  await requireAdmin();
  const { clientId } = await searchParams;
  const [themes, clients] = await Promise.all([listSmartcardThemes(), listSmartcardClientOptions()]);

  return (
    <div>
      <Link href="/admin/smartcard/profiles" className="mb-4 inline-block text-sm text-slate-500 hover:underline">
        ← Volver a perfiles
      </Link>
      <PageHeader title="Nuevo perfil" description="El link público queda en link.reymensolutions.mx/[slug]." />

      <SmartcardProfileForm themes={themes ?? []} clients={clients ?? []} lockedClientId={clientId} />
    </div>
  );
}
