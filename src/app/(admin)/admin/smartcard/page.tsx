import Link from "next/link";
import { CreditCard } from "lucide-react";
import { requireAdmin } from "@/lib/guards";
import { getServerLang } from "@/lib/i18n-server";
import { listSmartcardCompanies } from "@/lib/smartcard-link";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

const COPY = {
  es: {
    title: "SmartCard",
    desc: "Empresas de SmartCard y el cliente de Reymen al que están vinculadas. La vinculación y los accesos se manejan en el detalle de cada cliente.",
    notConfigured: "SmartCard no está configurado en este servidor",
    notConfiguredDesc: "Faltan SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en el .env.",
    empty: "No hay empresas en SmartCard",
    company: "Empresa",
    client: "Cliente en Reymen",
    members: "Con acceso",
    cards: "Tarjetas",
    none: "Sin vincular",
    stale: "Vínculo roto",
    staleHint: "Apunta a un cliente que no existe en Reymen. Vincúlala desde el detalle del cliente correcto.",
  },
  en: {
    title: "SmartCard",
    desc: "SmartCard companies and the Reymen client they're linked to. Linking and access are managed on each client's detail page.",
    notConfigured: "SmartCard isn't configured on this server",
    notConfiguredDesc: "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are missing from .env.",
    empty: "There are no companies in SmartCard",
    company: "Company",
    client: "Reymen client",
    members: "With access",
    cards: "Cards",
    none: "Not linked",
    stale: "Broken link",
    staleHint: "Points to a client that doesn't exist in Reymen. Link it from the right client's detail page.",
  },
};

export default async function AdminSmartcardPage() {
  await requireAdmin();
  const [lang, companies] = await Promise.all([getServerLang(), listSmartcardCompanies()]);
  const t = COPY[lang === "en" ? "en" : "es"];

  return (
    <div>
      <PageHeader title={t.title} description={t.desc} />
      {companies === null ? (
        <EmptyState icon={CreditCard} title={t.notConfigured} description={t.notConfiguredDesc} />
      ) : companies.length === 0 ? (
        <EmptyState icon={CreditCard} title={t.empty} />
      ) : (
        <Card>
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3 font-medium">{t.company}</th>
                  <th className="px-4 py-3 font-medium">{t.client}</th>
                  <th className="px-4 py-3 text-right font-medium">{t.members}</th>
                  <th className="px-4 py-3 text-right font-medium">{t.cards}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {companies.map((c) => (
                  <tr key={c.id}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">{c.name}</p>
                      <p className="text-xs text-slate-400">{c.slug}</p>
                    </td>
                    <td className="px-4 py-3">
                      {c.link.kind === "client" ? (
                        <Link href={`/admin/clients/${c.link.clientId}`} className="text-brand-600 hover:underline">
                          {c.link.clientName}
                        </Link>
                      ) : c.link.kind === "stale" ? (
                        <div>
                          <Badge variant="outline" className="border-amber-300 text-amber-700">
                            {t.stale}
                          </Badge>
                          <p className="mt-1 max-w-xs text-xs text-slate-500">{t.staleHint}</p>
                        </div>
                      ) : (
                        <span className="text-slate-400">{t.none}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-700">{c.activeMembers}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-700">{c.cards}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
