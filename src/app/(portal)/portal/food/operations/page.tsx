import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { requireModule } from "@/lib/modules";
import { getServerT } from "@/lib/i18n-server";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/EmptyState";
import { ClipboardList } from "lucide-react";

// Igual que Recetas (ver ese archivo): Operación (mesas, tickets, turnos,
// cancelaciones) todavía no tiene modelo propio. Página real, gateada por
// el módulo, sin datos falsos.
export default async function FoodOperationsPage() {
  const session = await auth();
  if (!session?.user.organizationId) return redirect("/login");
  await requireModule(session.user.organizationId, "FOOD_OPS");

  const t = await getServerT();

  return (
    <div>
      <PageHeader title={t.foodOperations} description="Mesas, tickets, turnos y cancelaciones." />
      <Card>
        <CardContent className="py-12">
          <EmptyState
            icon={ClipboardList}
            title="Todavía no está construido"
            description="Operación necesita su propio modelo (mesas, tickets, turnos) antes de tener datos reales aquí."
          />
        </CardContent>
      </Card>
    </div>
  );
}
