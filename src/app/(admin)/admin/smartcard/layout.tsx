import { CreditCard } from "lucide-react";
import { requireAdmin } from "@/lib/guards";
import { getSmartcardAdminClient } from "@/lib/smartcard-supabase";
import { EmptyState } from "@/components/shared/EmptyState";
import { SmartcardAdminTabs } from "@/components/admin/SmartcardAdminTabs";

/**
 * Marco común de Admin → SmartCard: la barra de pestañas y el aviso de
 * "no configurado", una sola vez, en lugar de repetirlos en cada pantalla.
 */
export default async function SmartcardAdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  const configured = getSmartcardAdminClient() !== null;

  return (
    <div>
      <SmartcardAdminTabs />
      {configured ? (
        children
      ) : (
        <EmptyState
          icon={CreditCard}
          title="SmartCard no está configurado en este servidor"
          description="Faltan SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en el .env."
        />
      )}
    </div>
  );
}
