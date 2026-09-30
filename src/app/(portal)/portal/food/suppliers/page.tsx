import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { requireModule } from "@/lib/modules";
import { prisma } from "@/lib/prisma";
import { createFoodSupplier } from "@/actions/food";
import { getServerLang, getServerT } from "@/lib/i18n-server";
import { foodStrings } from "@/lib/i18n-food";
import { pickDict } from "@/lib/i18n-dict";
import { formatMoney } from "@/lib/utils";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/EmptyState";
import { Users } from "lucide-react";
import { FoodSupplierEditDialog } from "@/components/portal/FoodSupplierEditDialog";
import { FoodArchiveButtons } from "@/components/portal/FoodArchiveButtons";
import { Badge } from "@/components/ui/badge";
import { can } from "@/lib/permissions";
import { cn } from "@/lib/utils";

export default async function FoodSuppliersPage() {
  const session = await auth();
  if (!session?.user.organizationId) return redirect("/login");
  await requireModule(session.user.organizationId, "FOOD_OPS");

  const orgId = session.user.organizationId;

  const [t, lang, suppliers] = await Promise.all([
    getServerT(),
    getServerLang(),
    prisma.foodSupplier.findMany({
      where: { organizationId: orgId },
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
      include: {
        purchases: {
          where: { voidedAt: null },
          orderBy: { purchasedAt: "desc" },
          take: 1,
          select: { purchasedAt: true, total: true },
        },
      },
    }),
  ]);

  const f = pickDict(foodStrings, lang);
  const canManage = can(session.user.role, "food:manage");

  return (
    <div>
      <PageHeader title={t.foodSuppliers} description={f.suppliersDesc} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{f.suppliers}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {suppliers.length === 0 ? (
                <div className="p-6">
                  <EmptyState icon={Users} title={f.noSuppliersYet} description={f.addFirstWithForm} />
                </div>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {suppliers.map((supplier) => (
                    <li key={supplier.id} className={cn("flex items-start justify-between gap-3 px-6 py-3", !supplier.isActive && "opacity-60")}>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-slate-900">{supplier.name}</p>
                          {!supplier.isActive && <Badge variant="secondary" className="text-[10px]">{f.inactive}</Badge>}
                        </div>
                        <p className="text-xs text-slate-500">
                          {[supplier.contactName, supplier.phone, supplier.email].filter(Boolean).join(" · ") || f.noContactInfo}
                        </p>
                        {supplier.purchases[0] && (
                          <p className="text-xs text-slate-400">
                            {f.lastPurchase(
                              supplier.purchases[0].purchasedAt.toLocaleDateString(f.dateLocale),
                              formatMoney(Number(supplier.purchases[0].total))
                            )}
                          </p>
                        )}
                        {supplier.notes && <p className="mt-0.5 whitespace-pre-line text-xs text-slate-400">{supplier.notes}</p>}
                      </div>
                      {canManage && (
                        <div className="flex shrink-0 items-center">
                          <FoodSupplierEditDialog
                            supplier={{
                              id: supplier.id,
                              name: supplier.name,
                              contactName: supplier.contactName,
                              phone: supplier.phone,
                              email: supplier.email,
                              notes: supplier.notes,
                            }}
                          />
                          <FoodArchiveButtons kind="supplier" id={supplier.id} name={supplier.name} isActive={supplier.isActive} />
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        {!canManage ? (
          <p className="self-start rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-500">{f.viewOnlyNotice}</p>
        ) : (
          <Card className="self-start">
            <CardHeader>
              <CardTitle className="text-base">{f.addSupplier}</CardTitle>
            </CardHeader>
            <CardContent>
              <form action={createFoodSupplier} className="flex flex-col gap-3">
                <div className="flex flex-col gap-1">
                  <label htmlFor="name" className="text-xs font-medium text-slate-600">{f.name}</label>
                  <input id="name" name="name" type="text" required className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500" />
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor="contactName" className="text-xs font-medium text-slate-600">{f.contact}</label>
                  <input id="contactName" name="contactName" type="text" className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500" />
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor="phone" className="text-xs font-medium text-slate-600">{f.phone}</label>
                  <input id="phone" name="phone" type="tel" className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500" />
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor="email" className="text-xs font-medium text-slate-600">{f.email}</label>
                  <input id="email" name="email" type="email" className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500" />
                </div>
                <button type="submit" className="mt-1 rounded-md bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700">
                  {f.saveSupplier}
                </button>
              </form>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
