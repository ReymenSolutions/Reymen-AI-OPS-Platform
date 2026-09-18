import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { requireModule } from "@/lib/modules";
import { prisma } from "@/lib/prisma";
import { createFoodInventoryItem } from "@/actions/food";
import { getServerT } from "@/lib/i18n-server";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Package } from "lucide-react";

export default async function FoodInventoryPage() {
  const session = await auth();
  if (!session?.user.organizationId) return redirect("/login");
  await requireModule(session.user.organizationId, "FOOD_OPS");

  const orgId = session.user.organizationId;

  const [t, items] = await Promise.all([
    getServerT(),
    prisma.foodInventoryItem.findMany({
      where: { organizationId: orgId },
      orderBy: { name: "asc" },
    }),
  ]);

  const lowStock = items.filter((i) => Number(i.currentStock) <= Number(i.minStock));

  return (
    <div>
      <PageHeader
        title={t.foodInventory}
        description={
          lowStock.length > 0
            ? `${lowStock.length} insumo(s) en o bajo el mínimo de stock.`
            : "Existencias, mínimos y costo por insumo."
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Insumos</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {items.length === 0 ? (
                <div className="p-6">
                  <EmptyState icon={Package} title="Sin insumos todavía" description="Agrega el primero con el formulario de la derecha." />
                </div>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {items.map((item) => {
                    const low = Number(item.currentStock) <= Number(item.minStock);
                    return (
                      <li key={item.id} className="flex items-center justify-between px-6 py-3">
                        <div>
                          <p className="text-sm font-medium text-slate-900">{item.name}</p>
                          <p className="text-xs text-slate-500">
                            Mínimo: {Number(item.minStock)} {item.unit}
                            {item.unitCost !== null && ` · Costo unitario: $${Number(item.unitCost).toFixed(2)}`}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold text-slate-900">
                            {Number(item.currentStock)} {item.unit}
                          </p>
                          {low && <Badge variant="destructive" className="mt-1">Stock bajo</Badge>}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Agregar insumo</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={createFoodInventoryItem} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <label htmlFor="name" className="text-xs font-medium text-slate-600">Nombre</label>
                <input id="name" name="name" type="text" required className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500" />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="unit" className="text-xs font-medium text-slate-600">Unidad</label>
                <input id="unit" name="unit" type="text" placeholder="kg, lt, pza..." required className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500" />
              </div>
              <div className="flex gap-3">
                <div className="flex flex-1 flex-col gap-1">
                  <label htmlFor="currentStock" className="text-xs font-medium text-slate-600">Stock actual</label>
                  <input id="currentStock" name="currentStock" type="number" step="0.01" min="0" defaultValue={0} className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500" />
                </div>
                <div className="flex flex-1 flex-col gap-1">
                  <label htmlFor="minStock" className="text-xs font-medium text-slate-600">Mínimo</label>
                  <input id="minStock" name="minStock" type="number" step="0.01" min="0" defaultValue={0} className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500" />
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="unitCost" className="text-xs font-medium text-slate-600">Costo unitario (opcional)</label>
                <input id="unitCost" name="unitCost" type="number" step="0.01" min="0" className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500" />
              </div>
              <button type="submit" className="mt-1 rounded-md bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700">
                Guardar insumo
              </button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
