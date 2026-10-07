import { requireAdmin } from "@/lib/guards";
import { listSmartcardCompanyOptions } from "@/lib/smartcard-admin";
import { PageHeader } from "@/components/shared/PageHeader";
import { SmartcardClientForm } from "@/components/admin/SmartcardClientForm";

export default async function NewSmartcardClientPage() {
  await requireAdmin();
  const companies = (await listSmartcardCompanyOptions()) ?? [];

  return (
    <div>
      <PageHeader title="SmartCard · Nuevo cliente" />
      <SmartcardClientForm companies={companies} />
    </div>
  );
}
