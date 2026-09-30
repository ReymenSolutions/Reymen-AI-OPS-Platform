import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { requireModule } from "@/lib/modules";
import { prisma } from "@/lib/prisma";
import { createFoodSupplier } from "@/actions/food";
import { getServerLang, getServerT } from "@/lib/i18n-server";
import { foodStrings } from "@/lib/i18n-food";
import { pickDict } from "@/lib/i18n-dict";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/EmptyState";
import { Users } from "lucide-react";

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
      orderBy: { name: "asc" },
    }),
  ]);

  const f = pickDict(foodStrings, lang);

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
                    <li key={supplier.id} className="px-6 py-3">
                      <p className="text-sm font-medium text-slate-900">{supplier.name}</p>
                      <p className="text-xs text-slate-500">
                        {[supplier.contactName, supplier.phone, supplier.email].filter(Boolean).join(" · ") || f.noContactInfo}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
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
      </div>
    </div>
  );
}
