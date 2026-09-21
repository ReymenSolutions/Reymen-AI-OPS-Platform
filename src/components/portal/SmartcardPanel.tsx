"use client";

import { useState, useTransition } from "react";
import { Loader2, CreditCard, Users, Activity } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { usePreferences } from "@/context/preferences";
import { inviteSmartcardTeamMember } from "@/actions/portal/smartcard";
import {
  EVENT_TYPE_LABELS_ES,
  type SmartcardMembership,
  type CompanyRosterEntry,
  type CompanyCardStats,
} from "@/lib/smartcard-company";

const MODULE_LABELS_ES: Record<string, string> = {
  smartcard: "SmartCard",
  realty: "Realty",
  food: "Food",
  retail: "Retail",
  care: "Care",
};
const MODULE_LABELS_EN: Record<string, string> = {
  smartcard: "SmartCard",
  realty: "Realty",
  food: "Food",
  retail: "Retail",
  care: "Care",
};

const ROLE_LABELS_ES: Record<string, string> = {
  owner: "Dueño",
  admin: "Administrador",
  manager: "Gerente",
  staff: "Personal",
  agent: "Asesor",
};
const ROLE_LABELS_EN: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  manager: "Manager",
  staff: "Staff",
  agent: "Agent",
};

const STATUS_LABELS_ES: Record<string, string> = {
  invited: "Invitado",
  active: "Activo",
  suspended: "Suspendido",
  removed: "Eliminado",
};
const STATUS_LABELS_EN: Record<string, string> = {
  invited: "Invited",
  active: "Active",
  suspended: "Suspended",
  removed: "Removed",
};

// EVENT_TYPE_LABELS_ES itself is imported from smartcard-company.ts (single
// source of truth, next to the query that produces the raw event_type
// values) — this English pair lives here since lib/ only ever needed the
// Spanish one so far.
const EVENT_TYPE_LABELS_EN: Record<string, string> = {
  qr_scan: "QR scans",
  profile_view: "Profile views",
  whatsapp_click: "WhatsApp clicks",
  call_click: "Call clicks",
  email_click: "Email clicks",
  facebook_click: "Facebook clicks",
  instagram_click: "Instagram clicks",
  custom_link_click: "Custom link clicks",
  save_contact: "Contacts saved",
};

const INVITABLE_ROLES = ["admin", "manager", "staff", "agent"];

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-slate-100 bg-slate-50 px-3 py-3">
      <div className="text-2xl font-semibold text-slate-900">{value.toLocaleString()}</div>
      <div className="mt-0.5 text-xs text-slate-500">{label}</div>
    </div>
  );
}

/**
 * Client half of the SmartCard page — dashboard summary (contracted
 * modules) + team roster/invite, both ported from reymen-smartcard's
 * apps/ops app/dashboard + app/settings pages (see page.tsx and
 * actions/portal/smartcard.ts for the fuller history). UI-wise this
 * follows THIS app's own conventions (toast + useTransition, matching
 * OrganizationModulesPanel.tsx) rather than the original's full-page
 * redirect-with-query-string-error pattern.
 */
export function SmartcardPanel({
  membership,
  roster,
  cardStats,
  currentUserEmail,
}: {
  membership: SmartcardMembership;
  roster: CompanyRosterEntry[];
  cardStats: CompanyCardStats;
  currentUserEmail: string;
}) {
  const { lang } = usePreferences();
  const MODULE_LABELS = lang === "es" ? MODULE_LABELS_ES : MODULE_LABELS_EN;
  const ROLE_LABELS = lang === "es" ? ROLE_LABELS_ES : ROLE_LABELS_EN;
  const STATUS_LABELS = lang === "es" ? STATUS_LABELS_ES : STATUS_LABELS_EN;
  const EVENT_TYPE_LABELS = lang === "es" ? EVENT_TYPE_LABELS_ES : EVENT_TYPE_LABELS_EN;

  const byTypeEntries = Object.entries(cardStats.byType).sort((a, b) => b[1] - a[1]);
  const maxTypeCount = byTypeEntries.length > 0 ? byTypeEntries[0][1] : 0;
  const avgEventsPerCard = cardStats.totalCards > 0 ? Math.round(cardStats.totalEvents / cardStats.totalCards) : 0;

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [roleCode, setRoleCode] = useState("staff");
  const [isPending, startTransition] = useTransition();

  const canManageTeam = ["owner", "admin"].includes(membership.roleCode);
  const seatCount = roster.filter((m) => m.status === "invited" || m.status === "active").length;
  const maxTeamMembers = membership.limits.smartcard?.max_team_members as number | undefined;
  const atLimit = typeof maxTeamMembers === "number" && seatCount >= maxTeamMembers;

  function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      // inviteSmartcardTeamMember returns { success } / { success: false, error }
      // instead of throwing — Next.js redacts a thrown Server Action error's
      // message in production, so relying on try/catch here showed a generic
      // crash instead of the real reason (see the action's own comment).
      try {
        const result = await inviteSmartcardTeamMember(name, email, roleCode, password);
        if (!result.success) {
          toast.error(result.error);
          return;
        }
        toast.success(
          lang === "es"
            ? "Listo. Comparte la contraseña temporal con esa persona para que inicie sesión."
            : "Done. Share the temporary password with that person so they can log in."
        );
        setName("");
        setEmail("");
        setPassword("");
        setRoleCode("staff");
      } catch {
        // Belt-and-suspenders only — inviteSmartcardTeamMember shouldn't throw.
        toast.error(lang === "es" ? "Error al invitar" : "Error inviting");
      }
    });
  }

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-8">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">SmartCard</h1>
        <p className="mt-1 text-sm text-slate-500">
          {lang === "es" ? "Empresa" : "Company"}: {membership.companyName} ·{" "}
          {lang === "es" ? "tu rol" : "your role"}: {ROLE_LABELS[membership.roleCode] ?? membership.roleCode}
        </p>
      </div>

      <Card>
        <CardHeader className="flex-row items-center gap-2">
          <CreditCard className="h-4 w-4 text-slate-400" />
          <CardTitle>{lang === "es" ? "Módulos contratados" : "Contracted modules"}</CardTitle>
        </CardHeader>
        <CardContent>
          {membership.modules.length === 0 ? (
            <p className="rounded-md bg-slate-50 px-3 py-3 text-sm text-slate-500">
              {lang === "es"
                ? "Esta empresa todavía no tiene ningún módulo habilitado. Contacta a Reymen para activar un plan."
                : "This company doesn't have any module enabled yet. Contact Reymen to activate a plan."}
            </p>
          ) : (
            <ul className="divide-y divide-slate-100 text-sm">
              {membership.modules.map((m) => (
                <li key={m} className="px-1 py-2">
                  {MODULE_LABELS[m] ?? m}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center gap-2">
          <Activity className="h-4 w-4 text-slate-400" />
          <CardTitle>{lang === "es" ? "Estadísticas de tarjetas" : "Card statistics"}</CardTitle>
        </CardHeader>
        <CardContent>
          {cardStats.totalCards === 0 ? (
            <p className="rounded-md bg-slate-50 px-3 py-3 text-sm text-slate-500">
              {lang === "es"
                ? "Todavía no hay tarjetas emitidas para esta empresa."
                : "No cards have been issued for this company yet."}
            </p>
          ) : (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <StatTile label={lang === "es" ? "Tarjetas" : "Cards"} value={cardStats.totalCards} />
                <StatTile label={lang === "es" ? "Eventos totales" : "Total events"} value={cardStats.totalEvents} />
                <StatTile
                  label={lang === "es" ? "Promedio por tarjeta" : "Average per card"}
                  value={avgEventsPerCard}
                />
              </div>

              {byTypeEntries.length > 0 && (
                <div>
                  <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                    {lang === "es" ? "Por tipo de evento" : "By event type"}
                  </h3>
                  <ul className="space-y-2">
                    {byTypeEntries.map(([type, count]) => (
                      <li key={type} className="flex items-center gap-3 text-sm">
                        <span className="w-36 shrink-0 truncate text-slate-600" title={EVENT_TYPE_LABELS[type] ?? type}>
                          {EVENT_TYPE_LABELS[type] ?? type}
                        </span>
                        <span className="h-2 flex-1 rounded-full bg-slate-100">
                          <span
                            className="block h-2 rounded-full bg-blue-500"
                            style={{ width: `${maxTypeCount > 0 ? Math.max(4, (count / maxTypeCount) * 100) : 0}%` }}
                          />
                        </span>
                        <span className="w-10 shrink-0 text-right font-medium text-slate-700">{count}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div>
                <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                  {lang === "es" ? "Por tarjeta" : "By card"}
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                        <th className="py-2 pr-3 font-medium">{lang === "es" ? "Tarjeta" : "Card"}</th>
                        <th className="py-2 pr-3 font-medium">{lang === "es" ? "Integrante" : "Member"}</th>
                        <th className="py-2 pr-3 font-medium">{lang === "es" ? "Estado" : "Status"}</th>
                        <th className="py-2 pr-3 text-right font-medium">{lang === "es" ? "Eventos" : "Events"}</th>
                        <th className="py-2 font-medium">{lang === "es" ? "Última actividad" : "Last activity"}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {cardStats.cards.map((c) => (
                        <tr key={c.cardId}>
                          <td className="py-2 pr-3 font-mono text-xs text-slate-700">{c.cardCode}</td>
                          <td className="py-2 pr-3 text-slate-600">{c.clientName}</td>
                          <td className="py-2 pr-3">
                            <Badge variant="secondary" className="text-xs">
                              {c.status}
                            </Badge>
                          </td>
                          <td className="py-2 pr-3 text-right font-medium text-slate-700">{c.totalEvents}</td>
                          <td className="py-2 text-slate-500">
                            {c.lastActivityAt
                              ? new Date(c.lastActivityAt).toLocaleDateString(lang === "es" ? "es-MX" : "en-US", {
                                  year: "numeric",
                                  month: "short",
                                  day: "numeric",
                                })
                              : lang === "es"
                                ? "Sin actividad"
                                : "No activity"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-slate-400" />
            <CardTitle>{lang === "es" ? "Equipo" : "Team"}</CardTitle>
          </div>
          <span className={`text-sm ${atLimit ? "font-medium text-amber-700" : "text-slate-500"}`}>
            {seatCount} / {maxTeamMembers ?? "∞"} {lang === "es" ? "integrantes" : "members"}
          </span>
        </CardHeader>
        <CardContent>
          {roster.length > 0 ? (
            <ul className="mb-4 divide-y divide-slate-100 text-sm">
              {roster.map((m) => (
                <li key={m.id} className="flex items-center justify-between py-2">
                  <span>
                    {m.isCurrentUser ? currentUserEmail : (lang === "es" ? "Integrante" : "Member")} —{" "}
                    {ROLE_LABELS[m.roleCode] ?? m.roleCode}
                  </span>
                  <Badge variant="secondary" className="text-xs">
                    {STATUS_LABELS[m.status] ?? m.status}
                  </Badge>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mb-4 text-sm text-slate-500">
              {lang === "es" ? "Todavía no hay integrantes." : "No members yet."}
            </p>
          )}

          {canManageTeam ? (
            atLimit ? (
              <p className="rounded-md bg-amber-50 px-3 py-3 text-sm text-amber-800">
                {lang === "es"
                  ? "Llegaste al límite de integrantes de tu plan. Contacta a Reymen para subir de plan."
                  : "You reached your plan's member limit. Contact Reymen to upgrade."}
              </p>
            ) : (
              <form onSubmit={handleInvite} className="flex flex-col gap-3">
                <p className="text-xs text-slate-500">
                  {lang === "es"
                    ? "Se crea una cuenta del portal para esa persona con la contraseña que pongas aquí — compártesela tú directamente después."
                    : "This creates a portal account for that person with the password you set here — share it with them directly afterward."}
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="flex flex-col gap-1">
                    <label htmlFor="smartcard-invite-name" className="text-xs font-medium text-slate-600">
                      {lang === "es" ? "Nombre completo" : "Full name"}
                    </label>
                    <input
                      id="smartcard-invite-name"
                      type="text"
                      required
                      minLength={2}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                      placeholder={lang === "es" ? "Ana Martínez" : "Jane Doe"}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label htmlFor="smartcard-invite-email" className="text-xs font-medium text-slate-600">
                      {lang === "es" ? "Correo" : "Email"}
                    </label>
                    <input
                      id="smartcard-invite-email"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                      placeholder="nombre@empresa.com"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label htmlFor="smartcard-invite-role" className="text-xs font-medium text-slate-600">
                      {lang === "es" ? "Rol" : "Role"}
                    </label>
                    <select
                      id="smartcard-invite-role"
                      value={roleCode}
                      onChange={(e) => setRoleCode(e.target.value)}
                      className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                    >
                      {INVITABLE_ROLES.map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABELS[r]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label htmlFor="smartcard-invite-password" className="text-xs font-medium text-slate-600">
                      {lang === "es" ? "Contraseña temporal" : "Temporary password"}
                    </label>
                    <input
                      id="smartcard-invite-password"
                      type="password"
                      required
                      minLength={8}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                      placeholder={lang === "es" ? "Mínimo 8 caracteres" : "At least 8 characters"}
                    />
                  </div>
                </div>
                <Button type="submit" disabled={isPending} className="self-end">
                  {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  {lang === "es" ? "Invitar" : "Invite"}
                </Button>
              </form>
            )
          ) : (
            <p className="text-sm text-slate-400">
              {lang === "es"
                ? "Solo el dueño o un administrador puede invitar integrantes."
                : "Only the owner or an admin can invite members."}
            </p>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
