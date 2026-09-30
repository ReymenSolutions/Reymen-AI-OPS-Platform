import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { requireModule } from "@/lib/modules";
import { getServerLang, getServerT } from "@/lib/i18n-server";
import { foodStrings } from "@/lib/i18n-food";
import { pickDict } from "@/lib/i18n-dict";
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

  const [t, lang] = await Promise.all([getServerT(), getServerLang()]);
  const f = pickDict(foodStrings, lang);

  return (
    <div>
      <PageHeader title={t.foodOperations} description={f.operationsDesc} />
      <Card>
        <CardContent className="py-12">
          <EmptyState
            icon={ClipboardList}
            title={f.notBuiltYet}
            description={f.operationsNotBuiltDesc}
          />
        </CardContent>
      </Card>
    </div>
  );
}
