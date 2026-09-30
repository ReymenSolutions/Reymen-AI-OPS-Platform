import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Code, Webhook } from "lucide-react";
import { getServerLang } from "@/lib/i18n-server";

const ENDPOINTS = [
  {
    method: "POST",
    path: "/api/webhooks/n8n/leads",
    description: {
      es: "Crea un nuevo lead desde n8n. Requiere x-reymen-orgid y una firma HMAC-SHA256 del body (header x-reymen-signature) usando el secreto propio de esa organización.",
      en: "Creates a new lead from n8n. Requires x-reymen-orgid and an HMAC-SHA256 signature of the body (header x-reymen-signature) using that organization's own secret.",
    },
    body: JSON.stringify(
      { name: "Juan García", email: "juan@email.com", phone: "+52 55 1234 5678", source: "whatsapp", notes: "Interesado en consulta general" },
      null, 2
    ),
  },
  {
    method: "POST",
    path: "/api/webhooks/n8n/automations",
    description: {
      es: "Registra un evento de ejecución de automatización. Requiere firma HMAC con el secreto propio de esa automatización (no el de la organización). Status: SUCCESS | FAILED | PENDING.",
      en: "Records an automation run event. Requires an HMAC signature with that automation's own secret (not the organization's). Status: SUCCESS | FAILED | PENDING.",
    },
    body: JSON.stringify(
      { automationId: "auto_xxx", type: "lead_captured", status: "SUCCESS", duration: 843, errorMessage: null },
      null, 2
    ),
  },
  {
    method: "POST",
    path: "/api/webhooks/n8n/conversations",
    description: {
      es: "Crea o continúa una conversación de WhatsApp. Si el contactPhone ya existe con status OPEN, agrega el mensaje a esa conversación. Misma autenticación que /leads.",
      en: "Creates or continues a WhatsApp conversation. If the contactPhone already exists with status OPEN, the message is added to that conversation. Same authentication as /leads.",
    },
    body: JSON.stringify(
      { contactPhone: "+52 55 1234 5678", contactName: "María López", message: "Hola, quisiera una cita", role: "USER", channel: "whatsapp" },
      null, 2
    ),
  },
  {
    method: "POST",
    path: "/api/webhooks/n8n/scoring",
    description: {
      es: "Actualiza el score de un lead con el resultado del scoring de IA. Score entre 0 y 100. Misma autenticación que /leads.",
      en: "Updates a lead's score with the AI scoring result. Score between 0 and 100. Same authentication as /leads.",
    },
    body: JSON.stringify(
      { leadId: "lead_xxx", score: 87, reason: "Empresa grande, presupuesto confirmado, decisor." },
      null, 2
    ),
  },
  {
    method: "POST",
    path: "/api/webhooks/n8n/message-status",
    description: {
      es: "Reporta el estado de entrega de un mensaje enviado manualmente desde el portal (ver /whatsapp-outbound abajo). messageId es el que el portal envió al disparar el mensaje. Misma autenticación que /leads.",
      en: "Reports the delivery status of a message sent manually from the portal (see /whatsapp-outbound below). messageId is the one the portal sent when triggering the message. Same authentication as /leads.",
    },
    body: JSON.stringify(
      { messageId: "msg_xxx", status: "DELIVERED", errorMessage: null },
      null, 2
    ),
  },
  {
    method: "POST",
    path: "/api/webhooks/n8n/appointment-reminder-sent",
    description: {
      es: "Registra que se envió un recordatorio de cita (ver /due-reminders abajo), para que esa combinación cita+regla nunca vuelva a reportarse como pendiente. Misma autenticación que /leads.",
      en: "Records that an appointment reminder was sent (see /due-reminders below), so that appointment+rule pair is never reported as pending again. Same authentication as /leads.",
    },
    body: JSON.stringify(
      { appointmentId: "apt_xxx", ruleId: "rule_xxx" },
      null, 2
    ),
  },
  {
    method: "POST",
    path: "/api/webhooks/n8n/followup-sent",
    description: {
      es: "Registra que se envió un intento de seguimiento automático (ver /due-followups abajo). A diferencia de los recordatorios de citas, esto es acumulativo: una regla con repetición puede reportar varios envíos para el mismo lead, hasta su máximo de intentos. Misma autenticación que /leads.",
      en: "Records that an automatic follow-up attempt was sent (see /due-followups below). Unlike appointment reminders this is cumulative: a repeating rule can report several sends for the same lead, up to its maximum attempts. Same authentication as /leads.",
    },
    body: JSON.stringify(
      { leadId: "lead_xxx", ruleId: "rule_xxx" },
      null, 2
    ),
  },
  {
    method: "GET",
    path: "/api/v1/knowledge-base",
    description: {
      es: "Retorna artículos de la base de conocimiento. Autenticación: header X-Api-Key con el secreto propio de la organización. Parámetros: ?orgId=xxx&q=búsqueda&category=categoria.",
      en: "Returns knowledge base articles. Authentication: X-Api-Key header with the organization's own secret. Parameters: ?orgId=xxx&q=search&category=category.",
    },
    body: null,
  },
  {
    method: "GET",
    path: "/api/v1/conversations/status",
    description: {
      es: "Consulta si una conversación está en modo IA o control humano. El workflow de IA debe llamar esto antes de generar una respuesta automática y abstenerse si aiHandled es false — evita que el bot responda encima de un agente humano. Autenticación: X-Api-Key. Parámetros: ?orgId=xxx&contactPhone=xxx (o &conversationId=xxx).",
      en: "Checks whether a conversation is in AI mode or human control. The AI workflow must call this before generating an automatic reply and skip it if aiHandled is false — this keeps the bot from replying over a human agent. Authentication: X-Api-Key. Parameters: ?orgId=xxx&contactPhone=xxx (or &conversationId=xxx).",
    },
    body: null,
  },
  {
    method: "GET",
    path: "/api/v1/appointments/due-reminders",
    description: {
      es: "Retorna las citas que necesitan un recordatorio enviado ahora, según las reglas configuradas en Agenda → Configuración. La automatización de recordatorios debe llamar esto periódicamente (no hay cron dentro de la plataforma) y reportar cada envío con /appointment-reminder-sent. Autenticación: X-Api-Key. Parámetros: ?orgId=xxx.",
      en: "Returns the appointments that need a reminder sent now, according to the rules configured in Appointments → Settings. The reminders automation must call this periodically (there is no cron inside the platform) and report each send with /appointment-reminder-sent. Authentication: X-Api-Key. Parameters: ?orgId=xxx.",
    },
    body: null,
  },
  {
    method: "GET",
    path: "/api/v1/leads/due-followups",
    description: {
      es: "Retorna los leads que necesitan un seguimiento automático enviado ahora, según las reglas configuradas en Leads → Configurar seguimientos. Excluye leads con doNotContact activo y respeta el máximo de intentos y el intervalo de repetición de cada regla. La automatización debe llamar esto periódicamente y reportar cada envío con /followup-sent. Autenticación: X-Api-Key. Parámetros: ?orgId=xxx.",
      en: "Returns the leads that need an automatic follow-up sent now, according to the rules configured in Leads → Configure follow-ups. Excludes leads with doNotContact set and respects each rule's maximum attempts and repeat interval. The automation must call this periodically and report each send with /followup-sent. Authentication: X-Api-Key. Parameters: ?orgId=xxx.",
    },
    body: null,
  },
];

const AUTH_HEADER = `X-Reymen-OrgId: <organization id>
X-Reymen-Timestamp: <unix ms, e.g. Date.now()>
X-Reymen-Signature: sha256=<hmac_sha256(org_secret, \`\${timestamp}.\${body}\`)>
X-Reymen-Event-Id: <optional but recommended — see below>
Content-Type: application/json`;

export default async function ApiDocsPage() {
  const lang = await getServerLang();
  const es = lang === "es";

  return (
    <div>
      <PageHeader
        title={es ? "Documentación de API" : "API documentation"}
        description={es ? "Referencia de webhooks y endpoints disponibles para n8n" : "Reference of the webhooks and endpoints available to n8n"}
      />

      {/* Auth info */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Webhook className="h-4 w-4" />
            {es ? "Autenticación de Webhooks" : "Webhook authentication"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {es ? (
            <>
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
            </>
          ) : (
            <>
          <p className="text-sm text-slate-600">
            The leads, conversations and scoring webhooks and the knowledge base API are authenticated with 
            <strong>each organization&apos;s own secret</strong> (never a shared one) — get it from 
            <code className="rounded bg-slate-100 px-1 font-mono text-xs">Clients → [client] → n8n credentials</code> 
            in this panel. Include an HMAC-SHA256 signature in the 
            <code className="rounded bg-slate-100 px-1 font-mono text-xs">x-reymen-signature</code> header, computed over 
            <code className="rounded bg-slate-100 px-1 font-mono text-xs">{"{timestamp}.{body}"}</code> (not just the
            body), together with <code className="rounded bg-slate-100 px-1 font-mono text-xs">x-reymen-orgid</code> and 
            <code className="rounded bg-slate-100 px-1 font-mono text-xs">x-reymen-timestamp</code>.
          </p>
          <pre className="rounded-lg bg-slate-950 p-4 text-xs text-slate-300 overflow-x-auto">
            <code>{AUTH_HEADER}</code>
          </pre>
          <p className="text-sm text-slate-600">
            <strong>x-reymen-timestamp</strong> (Unix milliseconds) must be within a 5-minute window of the server
            clock — a correctly signed request with an old timestamp is rejected with 401. This keeps a captured
            request (a log, a proxy) from being replayed forever and still accepted. An existing n8n workflow that
            doesn&apos;t send this header yet will stop working after this update — it has to be added to the signature.
          </p>
          <p className="text-sm text-slate-600">
            <strong>x-reymen-event-id</strong> (optional but recommended): a unique identifier for that specific
            delivery (the n8n execution ID, for example). If sent, re-sending the same delivery with the same ID
            doesn&apos;t process it again — it answers <code className="rounded bg-slate-100 px-1 font-mono text-xs">{"{ success: true, duplicate: true }"}</code> 
            without creating a duplicate lead/message. Without this header every delivery is always processed, even
            a retry of the same event.
          </p>
          <p className="text-sm text-slate-600">
            For data-level dedupe (not just delivery-level), the <code className="rounded bg-slate-100 px-1 font-mono text-xs">/leads</code> 
            payloads and the <code className="rounded bg-slate-100 px-1 font-mono text-xs">/conversations</code> message accept
            an optional <code className="rounded bg-slate-100 px-1 font-mono text-xs">externalId</code> field (the lead&apos;s ID in
            your own CRM, or the WhatsApp message ID) — if a lead/message with that externalId already exists, the
            delivery is ignored without duplicating.
          </p>
          <p className="text-sm text-slate-600">
            For the Knowledge Base API, use the 
            <code className="rounded bg-slate-100 px-1 font-mono text-xs">X-Api-Key: {"<organization secret>"}</code> 
            header together with <code className="rounded bg-slate-100 px-1 font-mono text-xs">?orgId=</code> (no signature or timestamp).
          </p>
          <p className="text-sm text-slate-600">
            <strong>/api/webhooks/n8n/automations</strong> is different: it is authenticated with each automation&apos;s
            own secret (shown in its &quot;Webhook Info&quot; dialog in Automations), not the organization&apos;s, but it
            uses the same timestamp/signature/event-id scheme.
          </p>
            </>
          )}
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
              <p className="text-sm text-slate-600">{ep.description[lang]}</p>
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
            {es ? "Envío saliente (plataforma → n8n)" : "Outbound sending (platform → n8n)"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {es ? (
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
          ) : (
          <p className="text-sm text-slate-600">
              The platform never calls the WhatsApp Business API directly — when an agent sends a manual message from
              the portal, the platform saves the <code className="rounded bg-slate-100 px-1 font-mono text-xs">Message</code> 
              (status <code className="rounded bg-slate-100 px-1 font-mono text-xs">PENDING</code>) and fires a signed POST request
              (same timestamp/HMAC scheme) to 
              <code className="rounded bg-slate-100 px-1 font-mono text-xs">{"{N8N_BASE_URL}/webhook/whatsapp-outbound"}</code>.
              The n8n workflow at that endpoint is responsible for calling the WhatsApp Business API and reporting the
              result with <code className="rounded bg-slate-100 px-1 font-mono text-xs">/api/webhooks/n8n/message-status</code> 
              using the same <code className="rounded bg-slate-100 px-1 font-mono text-xs">messageId</code> it received.
            </p>
          )}
          <pre className="rounded-lg bg-slate-950 p-4 text-xs text-slate-300 overflow-x-auto">
            <code>{JSON.stringify(
              { organizationId: "org_xxx", event: "message.send", data: { conversationId: "conv_xxx", messageId: "msg_xxx", contactPhone: "+52 55 1234 5678", channel: "whatsapp", content: "Claro, tenemos disponibilidad el jueves.", attachmentUrl: null, attachmentType: null } },
              null, 2
            )}</code>
          </pre>
          {es ? (
          <p className="text-sm text-slate-600">
              <strong>{"{N8N_BASE_URL}/webhook/ai-lab-test"}</strong> (Fase 7 — Laboratorio de IA) funciona igual, pero
              es <em>síncrono</em>: la plataforma espera la respuesta HTTP real de n8n (hasta 20s) en vez de dispararla
              y olvidarla, porque el sandbox/casos de prueba/experimentos A/B necesitan mostrar la respuesta generada.
              El workflow debe configurarse con &quot;Respond&quot; = &quot;Using &apos;Respond to Webhook&apos; Node&quot;
              (no &quot;Immediately&quot;) y devolver:
            </p>
          ) : (
          <p className="text-sm text-slate-600">
              <strong>{"{N8N_BASE_URL}/webhook/ai-lab-test"}</strong> (Phase 7 — AI Lab) works the same way, but it is{" "}
              <em>synchronous</em>: the platform waits for n8n&apos;s actual HTTP response (up to 20s) instead of firing and
              forgetting, because the sandbox, test cases and A/B experiments need to show the generated reply. The
              workflow must be set to &quot;Respond&quot; = &quot;Using &apos;Respond to Webhook&apos; Node&quot;
              (not &quot;Immediately&quot;) and return:
            </p>
          )}
          <pre className="rounded-lg bg-slate-950 p-4 text-xs text-slate-300 overflow-x-auto">
            <code>{JSON.stringify(
              { organizationId: "org_xxx", event: "ai_lab.test_message", data: { promptType: "SYSTEM", promptContent: "...", systemContent: null, knowledgeBase: [{ id: "kb_xxx", title: "...", content: "...", category: "faq" }], conversationHistory: [], userMessage: "¿Cuál es el horario?" } },
              null, 2
            )}</code>
          </pre>
          <p className="text-sm text-slate-600">{es ? "Respuesta esperada de n8n:" : "Expected response from n8n:"}</p>
          <pre className="rounded-lg bg-slate-950 p-4 text-xs text-slate-300 overflow-x-auto">
            <code>{JSON.stringify({ reply: "Abrimos de 7am a 5pm...", knowledgeBaseContext: ["kb_xxx"] }, null, 2)}</code>
          </pre>
          <p className="text-sm text-slate-600">
            {es
              ? "Si este workflow no está configurado para una organización, el Laboratorio de IA muestra un error explícito en vez de una respuesta simulada — nunca inventa texto localmente."
              : "If this workflow isn't configured for an organization, the AI Lab shows an explicit error instead of a simulated reply — it never makes up text locally."}
          </p>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardContent className="p-5">
          <p className="text-sm text-slate-600">
            <span className="font-medium">{es ? "Base URL de desarrollo:" : "Development base URL:"}</span>{" "}
            <code className="rounded bg-slate-100 px-1 font-mono text-xs">http://localhost:3000</code>
          </p>
          <p className="text-sm text-slate-600 mt-1">
            <span className="font-medium">{es ? "Base URL de producción:" : "Production base URL:"}</span>{" "}
            {es ? "configurada en la variable de entorno" : "set in the environment variable"}{" "}
            <code className="rounded bg-slate-100 px-1 font-mono text-xs">NEXT_PUBLIC_APP_URL</code>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
