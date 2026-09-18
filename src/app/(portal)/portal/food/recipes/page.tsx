import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { requireModule } from "@/lib/modules";
import { getServerT } from "@/lib/i18n-server";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/EmptyState";
import { ChefHat } from "lucide-react";

// Vista de solo lectura -- todavía no existe un modelo de Recetas
// (ingredientes, cantidades, costo por ingrediente, costo total, relación
// venta-consumo). Se deja como página real y navegable, en vez de
// esconderla, para que el módulo Food se pueda ver completo desde ahora;
// construir el modelo real es un siguiente paso explícito, no algo que
// esta página deba simular con datos falsos.
export default async function FoodRecipesPage() {
  const session = await auth();
  if (!session?.user.organizationId) return redirect("/login");
  await requireModule(session.user.organizationId, "FOOD_OPS");

  const t = await getServerT();

  return (
    <div>
      <PageHeader title={t.foodRecipes} description="Ingredientes, cantidades y costo por receta." />
      <Card>
        <CardContent className="py-12">
          <EmptyState
            icon={ChefHat}
            title="Todavía no está construido"
            description="Recetas necesita su propio modelo (ingredientes ligados a Inventario, costo por porción, relación venta-consumo) antes de tener datos reales aquí."
          />
        </CardContent>
      </Card>
    </div>
  );
}
