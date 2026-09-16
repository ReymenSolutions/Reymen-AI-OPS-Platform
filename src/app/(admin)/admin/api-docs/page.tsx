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
    method: "POST",
    path: "/api/webhooks/n8n/message-status",
    description: "Reporta el estado de entrega de un mensaje enviado manualmente desde el portal (ver /whatsapp-outbound abajo). messageId es el que el portal envió al disparar el mensaje. Misma autenticación que /leads.",
    body: JSON.stringify(
      { messageId: "msg_xxx", status: "DELIVERED", errorMessage: null },
      null, 2
    ),
  },
  {
    method: "GET",
    path: "/api/v1/knowledge-base",
    description: "Retorna artículos de la base de conocimiento. Autenticación: header X-Api-Key con el secreto propio de la organización. Parámetros: ?orgId=xxx&q=búsqueda&category=categoria.",
    body: null,
  },
  {
    method: "GET",
    path: "/api/v1/conversations/status",
    description: "Consulta si una conversación está en modo IA o control humano. El workflow de IA debe llamar esto antes de generar una respuesta automática y abstenerse si aiHandled es false — evita que el bot responda encima de un agente humano. Autenticación: X-Api-Key. Parámetros: ?orgId=xxx&contactPhone=xxx (o &conversationId=xxx).",
    body: null,
  },
];

const AUTH_HEADER = `X-Reymen-OrgId: <organization id>
X-Reymen-Timestamp: <unix ms, e.g. Date.now()>
X-Reymen-Signature: sha256=<hmac_sha256(org_secret, \`\${timestamp}.\${body}\`)>
X-Reymen-Event-Id: <optional but recommended — see below>
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
            en este panel. Incluye una firma HMAC-SHA256 en el header{" "}
            <code className="rounded bg-slate-100 px-1 font-mono text-xs">x-reymen-signature</code>, calculada sobre{" "}
            <code className="rounded bg-slate-100 px-1 font-mono text-xs">{"{timestamp}.{body}"}</code> (no solo el
            body), junto con <code className="rounded bg-slate-100 px-1 font-mono text-xs">x-reymen-orgid</code> y{" "}
            <code className="rounded bg-slate-100 px-1 font-mono text-xs">x-reymen-timestamp</code>.
          </p>
          <pre className="rounded-lg bg-slate-950 p-4 text-xs text-slate-300 overflow-x-auto">
            <code>{AUTH_HEADER}</code>
          </pre>
          <p className="text-sm text-slate-600">
            <strong>x-reymen-timestamp</strong> (milisegundos Unix) debe estar dentro de una ventana de 5 minutos del
            reloj del servidor — una petición firmada correctamente pero con un timestamp viejo se rechaza con 401.
            Esto evita que una petición capturada (un log, un proxy) pueda reenviarse indefinidamente y seguir siendo
            aceptada. Un workflow de n8n existente que aún no envíe este header dejará de funcionar tras esta
            actualización — hay que agregarlo a la firma.
          </p>
          <p className="text-sm text-slate-600">
            <strong>x-reymen-event-id</strong> (opcional pero recomendado): un identificador único de esa entrega
            específica (el ID de ejecución de n8n, por ejemplo). Si se envía, reenviar la misma entrega con el mismo
            ID no la vuelve a procesar — responde <code className="rounded bg-slate-100 px-1 font-mono text-xs">{"{ success: true, duplicate: true }"}</code>{" "}
            sin crear un lead/mensaje duplicado. Sin este header, cada entrega se procesa siempre, incluso si es un
            reintento del mismo evento.
          </p>
          <p className="text-sm text-slate-600">
            Para dedupe a nivel de dato (no solo de entrega), los payloads de <code className="rounded bg-slate-100 px-1 font-mono text-xs">/leads</code>{" "}
            y el mensaje de <code className="rounded bg-slate-100 px-1 font-mono text-xs">/conversations</code> aceptan
            un campo opcional <code className="rounded bg-slate-100 px-1 font-mono text-xs">externalId</code> (el ID
            del lead en tu propio CRM, o el ID del mensaje de WhatsApp) — si ya existe un lead/mensaje con ese
            externalId, la entrega se ignora sin duplicar.
          </p>
          <p className="text-sm text-slate-600">
            Para la API de Knowledge Base, usa el header{" "}
            <code className="rounded bg-slate-100 px-1 font-mono text-xs">X-Api-Key: {"<secreto de la organización>"}</code>{" "}
            junto con <code className="rounded bg-slate-100 px-1 font-mono text-xs">?orgId=</code> (sin firma ni timestamp).
          </p>
          <p className="text-sm text-slate-600">
            <strong>/api/webhooks/n8n/automations</strong> es distinto: se autentica con el secreto propio de cada
            automatización (visible en su diálogo &quot;Webhook Info&quot; en Automatizaciones), no con el de la organización,
            pero usa el mismo esquema de timestamp/firma/event-id.
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

      {/* Outbound: platform → n8n */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Webhook className="h-4 w-4" />
            Envío saliente (plataforma → n8n)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-slate-600">
            La plataforma nunca llama directamente a la API de WhatsApp Business — cuando un agente envía un mensaje
            manual desde el portal, la plataforma guarda el <code className="rounded bg-slate-100 px-1 font-mono text-xs">Message</code>{" "}
            (estado <code className="rounded bg-slate-100 px-1 font-mono text-xs">PENDING</code>) y dispara una
            petición POST firmada (mismo esquema timestamp/HMAC) a{" "}
            <code className="rounded bg-slate-100 px-1 font-mono text-xs">{"{N8N_BASE_URL}/webhook/whatsapp-outbound"}</code>.
            El workflow de n8n en ese endpoint es responsable de llamar a la API de WhatsApp Business y reportar el
            resultado con <code className="rounded bg-slate-100 px-1 font-mono text-xs">/api/webhooks/n8n/message-status</code>{" "}
            usando el mismo <code className="rounded bg-slate-100 px-1 font-mono text-xs">messageId</code> recibido.
          </p>
          <pre className="rounded-lg bg-slate-950 p-4 text-xs text-slate-300 overflow-x-auto">
            <code>{JSON.stringify(
              { organizationId: "org_xxx", event: "message.send", data: { conversationId: "conv_xxx", messageId: "msg_xxx", contactPhone: "+52 55 1234 5678", channel: "whatsapp", content: "Claro, tenemos disponibilidad el jueves.", attachmentUrl: null, attachmentType: null } },
              null, 2
            )}</code>
          </pre>
        </CardContent>
      </Card>

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
