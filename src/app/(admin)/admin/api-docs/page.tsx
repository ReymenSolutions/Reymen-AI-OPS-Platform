import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Code, Webhook } from "lucide-react";

const ENDPOINTS = [
  {
    method: "POST",
    path: "/api/webhooks/n8n/leads",
    description: "Crea un nuevo lead desde n8n. Requiere x-reymen-orgid y una firma HMAC-SHA256 del body (header x-reymen-signature) usando el secreto propio de esa organización.",
    body: JSON.stringify(
      { name: "Juan García", email: "juan@email.com", phone: "+52 55 1234 5678", source: "whatsapp", notes: "Interesado en consulta general" },
      null, 2
    ),
  },
  {
    method: "POST",
    path: "/api/webhooks/n8n/automations",
    description: "Registra un evento de ejecución de automatización. Requiere firma HMAC con el secreto propio de esa automatización (no el de la organización). Status: SUCCESS | FAILED | PENDING.",
    body: JSON.stringify(
      { automationId: "auto_xxx", type: "lead_captured", status: "SUCCESS", duration: 843, errorMessage: null },
      null, 2
    ),
  },
  {
    method: "POST",
    path: "/api/webhooks/n8n/conversations",
    description: "Crea o continúa una conversación de WhatsApp. Si el contactPhone ya existe con status OPEN, agrega el mensaje a esa conversación. Misma autenticación que /leads.",
    body: JSON.stringify(
      { contactPhone: "+52 55 1234 5678", contactName: "María López", message: "Hola, quisiera una cita", role: "USER", channel: "whatsapp" },
      null, 2
    ),
  },
  {
    method: "POST",
    path: "/api/webhooks/n8n/scoring",
    description: "Actualiza el score de un lead con el resultado del scoring de IA. Score entre 0 y 100. Misma autenticación que /leads.",
    body: JSON.stringify(
      { leadId: "lead_xxx", score: 87, reason: "Empresa grande, presupuesto confirmado, decisor." },
      null, 2
    ),
  },
  {
    method: "GET",
    path: "/api/v1/knowledge-base",
    description: "Retorna artículos de la base de conocimiento. Autenticación: header X-Api-Key con el secreto propio de la organización. Parámetros: ?orgId=xxx&q=búsqueda&category=categoria.",
    body: null,
  },
];

const AUTH_HEADER = `X-Reymen-OrgId: <organization id>
X-Reymen-Signature: sha256=<hmac_sha256(org_secret, body)>
Content-Type: application/json`;

export default function ApiDocsPage() {
  return (
    <div>
      <PageHeader
        title="Documentación de API"
        description="Referencia de webhooks y endpoints disponibles para n8n"
      />

      {/* Auth info */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Webhook className="h-4 w-4" />
            Autenticación de Webhooks
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-slate-600">
            Los webhooks de leads, conversaciones, scoring y la API de knowledge base se autentican con el{" "}
            <strong>secreto propio de cada organización</strong> (nunca uno compartido) — obtenlo desde{" "}
            <code className="rounded bg-slate-100 px-1 font-mono text-xs">Clientes → [cliente] → Credenciales n8n</code>{" "}
            en este panel. Incluye una firma HMAC-SHA256 del body en el header{" "}
            <code className="rounded bg-slate-100 px-1 font-mono text-xs">x-reymen-signature</code>, junto con{" "}
            <code className="rounded bg-slate-100 px-1 font-mono text-xs">x-reymen-orgid</code>.
          </p>
          <pre className="rounded-lg bg-slate-950 p-4 text-xs text-slate-300 overflow-x-auto">
            <code>{AUTH_HEADER}</code>
          </pre>
          <p className="text-sm text-slate-600">
            Para la API de Knowledge Base, usa el header{" "}
            <code className="rounded bg-slate-100 px-1 font-mono text-xs">X-Api-Key: {"<secreto de la organización>"}</code>{" "}
            junto con <code className="rounded bg-slate-100 px-1 font-mono text-xs">?orgId=</code>.
          </p>
          <p className="text-sm text-slate-600">
            <strong>/api/webhooks/n8n/automations</strong> es distinto: se autentica con el secreto propio de cada
            automatización (visible en su diálogo &quot;Webhook Info&quot; en Automatizaciones), no con el de la organización.
          </p>
        </CardContent>
      </Card>

      {/* Endpoints */}
      <div className="space-y-4">
        {ENDPOINTS.map((ep) => (
          <Card key={ep.path}>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-3">
                <Badge
                  variant={ep.method === "GET" ? "info" : "success"}
                  className="font-mono text-xs px-2"
                >
                  {ep.method}
                </Badge>
                <code className="text-sm font-mono text-slate-700">{ep.path}</code>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-slate-600">{ep.description}</p>
              {ep.body && (
                <div>
                  <div className="flex items-center gap-2 mb-1.5">
                    <Code className="h-3.5 w-3.5 text-slate-400" />
                    <span className="text-xs font-medium text-slate-500">Request body (JSON)</span>
                  </div>
                  <pre className="rounded-lg bg-slate-950 p-4 text-xs text-slate-300 overflow-x-auto">
                    <code>{ep.body}</code>
                  </pre>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="mt-6">
        <CardContent className="p-5">
          <p className="text-sm text-slate-600">
            <span className="font-medium">Base URL de desarrollo:</span>{" "}
            <code className="rounded bg-slate-100 px-1 font-mono text-xs">http://localhost:3000</code>
          </p>
          <p className="text-sm text-slate-600 mt-1">
            <span className="font-medium">Base URL de producción:</span>{" "}
            configurada en la variable de entorno{" "}
            <code className="rounded bg-slate-100 px-1 font-mono text-xs">NEXTAUTH_URL</code>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
