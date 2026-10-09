import Link from "next/link";
import { AlertTriangle, ArrowRight, BarChart3, CreditCard, Layers, MessageSquare, Shield, UserCog, Users, Zap } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/guards";
import { getServerLang } from "@/lib/i18n-server";
import { firstNameOf } from "@/lib/portal-home";
import { ShortcutGrid } from "@/components/shared/ShortcutGrid";

const COPY = {
  es: {
    greeting: "Hola",
    subtitle: "Esto es lo que pasa hoy en la plataforma.",
    todayTitle: "Resumen",
    clients: "Clientes activos",
    automations: "Automatizaciones activas",
    requests: "Solicitudes abiertas",
    attentionTitle: "Necesita tu atención",
    allGood: "Todo en orden por ahora. 🎉",
    errors: (n: number) => (n === 1 ? "1 automatización tiene un problema" : `${n} automatizaciones tienen un problema`),
    escalated: (n: number) => (n === 1 ? "1 conversación escalada sin atender" : `${n} conversaciones escaladas sin atender`),
    openRequests: (n: number) => (n === 1 ? "1 solicitud abierta" : `${n} solicitudes abiertas`),
    doTitle: "¿Qué quieres hacer?",
    full: "Ver el dashboard completo",
    shortcuts: {
      clients: ["Clientes", "Cuentas, planes y módulos"],
      users: ["Usuarios", "Quién tiene acceso"],
      requests: ["Solicitudes", "Lo que piden los clientes"],
      escalations: ["Escalaciones", "Conversaciones por atender"],
      automations: ["Automatizaciones", "Estado y errores"],
      smartcard: ["SmartCard", "Tarjetas y empresas"],
      templates: ["Plantillas", "Lo que se instala a clientes"],
      metrics: ["Métricas", "Cómo va la plataforma"],
      audit: ["Auditoría", "Quién hizo qué"],
    } as Record<string, [string, string]>,
  },
  en: {
    greeting: "Hi",
    subtitle: "Here's what's happening on the platform today.",
    todayTitle: "Summary",
    clients: "Active clients",
    automations: "Active automations",
    requests: "Open requests",
    attentionTitle: "Needs your attention",
    allGood: "All good for now. 🎉",
    errors: (n: number) => (n === 1 ? "1 automation has a problem" : `${n} automations have a problem`),
    escalated: (n: number) => (n === 1 ? "1 escalated conversation unattended" : `${n} escalated conversations unattended`),
    openRequests: (n: number) => (n === 1 ? "1 open request" : `${n} open requests`),
    doTitle: "What do you want to do?",
    full: "See the full dashboard",
    shortcuts: {
      clients: ["Clients", "Accounts, plans and modules"],
      users: ["Users", "Who has access"],
      requests: ["Requests", "What clients ask for"],
      escalations: ["Escalations", "Conversations to handle"],
      automations: ["Automations", "Status and errors"],
      smartcard: ["SmartCard", "Cards and companies"],
      templates: ["Templates", "What gets installed for clients"],
      metrics: ["Metrics", "How the platform is doing"],
      audit: ["Audit", "Who did what"],
    } as Record<string, [string, string]>,
  },
};

const SHORTCUTS: { key: string; href: string; icon: React.ElementType }[] = [
  { key: "clients", href: "/admin/clients", icon: Users },
  { key: "users", href: "/admin/users", icon: UserCog },
  { key: "requests", href: "/admin/requests", icon: MessageSquare },
  { key: "escalations", href: "/admin/escalations", icon: AlertTriangle },
  { key: "automations", href: "/admin/automations", icon: Zap },
  { key: "smartcard", href: "/admin/smartcard", icon: CreditCard },
  { key: "templates", href: "/admin/templates", icon: Layers },
  { key: "metrics", href: "/admin/metrics", icon: BarChart3 },
  { key: "audit", href: "/admin/audit", icon: Shield },
];

/** Inicio del admin: lo que requiere atención y atajos a lo de todos los días. */
export default async function AdminHomePage() {
  await requireAdmin();
  const [session, lang] = await Promise.all([auth(), getServerLang()]);
  const t = COPY[lang === "en" ? "en" : "es"];

  const [clients, activeAutomations, errors, openRequests, escalated] = await Promise.all([
    prisma.organization.count({ where: { isActive: true } }),
    prisma.automation.count({ where: { status: "ACTIVE" } }),
    prisma.automation.count({ where: { status: "ERROR" } }),
    prisma.request.count({ where: { status: "OPEN" } }),
    prisma.conversation.count({ where: { status: "ESCALATED" } }),
  ]);

  const attention: { text: string; href: string }[] = [];
  if (errors > 0) attention.push({ text: t.errors(errors), href: "/admin/automations" });
  if (escalated > 0) attention.push({ text: t.escalated(escalated), href: "/admin/escalations" });
  if (openRequests > 0) attention.push({ text: t.openRequests(openRequests), href: "/admin/requests" });

  const numbers = [
    { label: t.clients, value: clients, href: "/admin/clients" },
    { label: t.automations, value: activeAutomations, href: "/admin/automations" },
    { label: t.requests, value: openRequests, href: "/admin/requests" },
  ];
  const name = firstNameOf(session?.user.name);

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          {t.greeting}
          {name ? `, ${name}` : ""} 👋
        </h1>
        <p className="mt-1 text-slate-500">{t.subtitle}</p>
      </header>

      <section aria-labelledby="ahome-today" className="mb-8">
        <h2 id="ahome-today" className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          {t.todayTitle}
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {numbers.map((n) => (
            <Link key={n.label} href={n.href} className="rounded-2xl border border-slate-200 bg-white p-4 transition-colors hover:border-brand-300">
              <p className="text-sm text-slate-500">{n.label}</p>
              <p className="mt-1 text-3xl font-bold tabular-nums text-slate-900">{n.value}</p>
            </Link>
          ))}
        </div>

        <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-4">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-900">
            {attention.length > 0 && <AlertTriangle className="h-4 w-4 text-amber-500" />}
            {t.attentionTitle}
          </h3>
          {attention.length === 0 ? (
            <p className="text-sm text-slate-500">{t.allGood}</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {attention.map((a) => (
                <li key={a.href}>
                  <Link href={a.href} className="flex items-center justify-between gap-3 py-2.5 text-slate-800 hover:text-brand-700">
                    <span>{a.text}</span>
                    <ArrowRight className="h-4 w-4 flex-shrink-0 text-slate-400" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section aria-labelledby="ahome-do" className="mb-8">
        <h2 id="ahome-do" className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          {t.doTitle}
        </h2>
        <ShortcutGrid
          items={SHORTCUTS.map((s) => {
            const [title, hint] = t.shortcuts[s.key] ?? [s.key, ""];
            return { ...s, title, hint };
          })}
        />
      </section>

      <p className="text-center">
        <Link href="/admin/dashboard" className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline">
          {t.full} <ArrowRight className="h-4 w-4" />
        </Link>
      </p>
    </div>
  );
}
