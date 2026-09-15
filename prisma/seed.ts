import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { createHmac } from "crypto";

const prisma = new PrismaClient();

function generateWebhookSecret(): string {
  return createHmac("sha256", Math.random().toString())
    .update(Date.now().toString())
    .digest("hex");
}

async function main() {
  console.log("🌱 Seeding database...");

  // ─── Reymen Admin User ────────────────────────────────────────────
  const adminPassword = await bcrypt.hash("admin123456", 12);
  const admin = await prisma.user.upsert({
    where: { email: "admin@reymen.io" },
    update: {},
    create: {
      email: "admin@reymen.io",
      name: "Reymen Admin",
      passwordHash: adminPassword,
      role: "SUPER_ADMIN",
    },
  });
  console.log(`✅ Admin user: ${admin.email}`);

  // ─── Demo Client Organization ─────────────────────────────────────
  const clientPassword = await bcrypt.hash("client123456", 12);
  const demoOrg = await prisma.organization.upsert({
    where: { slug: "clinica-san-rafael" },
    update: {},
    create: {
      name: "Clínica San Rafael",
      slug: "clinica-san-rafael",
      industry: "clinic",
      plan: "starter",
      n8nWebhookSecret: generateWebhookSecret(),
      users: {
        create: {
          name: "Dr. Carlos Ramírez",
          email: "carlos@clinicasanrafael.com",
          passwordHash: clientPassword,
          role: "OWNER",
        },
      },
    },
    include: { users: true },
  });
  console.log(`✅ Demo org: ${demoOrg.name}`);

  // ─── Taller Wolf Organization ──────────────────────────────────────
  const wolfPassword = await bcrypt.hash("Wolf$Ricardo2024", 12);
  const wolfOrg = await prisma.organization.upsert({
    where: { slug: "taller-wolf" },
    update: {},
    create: {
      name: "Taller Automotriz Wolf",
      slug: "taller-wolf",
      industry: "workshop",
      plan: "starter",
      isActive: true,
      n8nWebhookSecret: generateWebhookSecret(),
      users: {
        create: {
          name: "Ricardo Wolf",
          email: "ricardo@tallerwolf.com",
          passwordHash: wolfPassword,
          role: "OWNER",
          isActive: true,
        },
      },
    },
    include: { users: true },
  });
  console.log(`✅ Wolf org: ${wolfOrg.name} | Usuario: ${wolfOrg.users[0]?.name ?? "ya existía"}`);

  // ─── Automations ──────────────────────────────────────────────────
  const automation1 = await prisma.automation.upsert({
    where: { id: "auto-demo-1" },
    update: {},
    create: {
      id: "auto-demo-1",
      organizationId: demoOrg.id,
      name: "Captura de leads - WhatsApp",
      description: "Captura automática de leads desde WhatsApp Business",
      type: "lead_capture",
      status: "ACTIVE",
      n8nWorkflowId: "wf-001",
      webhookSecret: generateWebhookSecret(),
    },
  });

  const automation2 = await prisma.automation.upsert({
    where: { id: "auto-demo-2" },
    update: {},
    create: {
      id: "auto-demo-2",
      organizationId: demoOrg.id,
      name: "Agenda de citas automática",
      description: "Agendamiento inteligente de citas médicas",
      type: "appointment",
      status: "ACTIVE",
      n8nWorkflowId: "wf-002",
      webhookSecret: generateWebhookSecret(),
    },
  });
  console.log("✅ Demo automations created");

  // ─── Automation Events ────────────────────────────────────────────
  for (let i = 0; i < 8; i++) {
    await prisma.automationEvent.create({
      data: {
        automationId: automation1.id,
        organizationId: demoOrg.id,
        type: "lead_captured",
        status: i % 5 === 0 ? "FAILED" : "SUCCESS",
        duration: Math.floor(Math.random() * 2000) + 200,
        errorMessage: i % 5 === 0 ? "WhatsApp API timeout" : null,
      },
    });
  }
  console.log("✅ Demo automation events created");

  // ─── Sample Leads ─────────────────────────────────────────────────
  const leads = [
    { name: "María García", email: "maria@gmail.com", phone: "+52 55 1234 5678", source: "whatsapp", status: "NEW" as const },
    { name: "Juan López", email: "juan@hotmail.com", phone: "+52 55 9876 5432", source: "web", status: "CONTACTED" as const },
    { name: "Ana Martínez", phone: "+52 55 5555 4444", source: "whatsapp", status: "QUALIFIED" as const },
    { name: "Roberto Sánchez", email: "roberto@empresa.com", source: "referral", status: "PROPOSAL" as const },
    { name: "Laura Torres", email: "laura@gmail.com", phone: "+52 55 3333 2222", source: "whatsapp", status: "WON" as const },
    { name: "Diego Flores", phone: "+52 55 7777 8888", source: "whatsapp", status: "NEW" as const },
  ];

  for (const lead of leads) {
    await prisma.lead.create({
      data: { ...lead, organizationId: demoOrg.id },
    });
  }
  console.log("✅ Demo leads created");

  // ─── Sample Conversations ─────────────────────────────────────────
  const conv = await prisma.conversation.create({
    data: {
      organizationId: demoOrg.id,
      channel: "whatsapp",
      contactPhone: "+52 55 1234 5678",
      contactName: "María García",
      status: "OPEN",
      messages: {
        create: [
          { role: "USER", content: "Hola, quisiera hacer una cita para consulta general" },
          { role: "ASSISTANT", content: "¡Hola! Con gusto te ayudo. ¿Tienes disponibilidad esta semana?" },
          { role: "USER", content: "Sí, el miércoles por la tarde" },
          { role: "ASSISTANT", content: "Perfecto. Tenemos disponibilidad el miércoles a las 3pm y 5pm. ¿Cuál prefieres?" },
        ],
      },
    },
  });
  console.log("✅ Demo conversations created");

  // ─── Sample Appointments ──────────────────────────────────────────
  const baseDate = new Date();
  baseDate.setDate(baseDate.getDate() + 1);

  await prisma.appointment.create({
    data: {
      organizationId: demoOrg.id,
      title: "Consulta general - María García",
      startTime: new Date(baseDate.setHours(15, 0, 0, 0)),
      endTime: new Date(baseDate.setHours(15, 30, 0, 0)),
      status: "CONFIRMED",
      source: "ai",
    },
  });

  await prisma.appointment.create({
    data: {
      organizationId: demoOrg.id,
      title: "Revisión médica - Juan López",
      startTime: new Date(new Date().setDate(new Date().getDate() + 3)),
      endTime: new Date(new Date().setDate(new Date().getDate() + 3)),
      status: "SCHEDULED",
      source: "ai",
    },
  });
  console.log("✅ Demo appointments created");

  // ─── Sample Requests ──────────────────────────────────────────────
  await prisma.request.create({
    data: {
      organizationId: demoOrg.id,
      title: "Integrar con sistema HIS del hospital",
      description: "Necesitamos que la automatización de citas se sincronice con nuestro sistema hospitalario interno. El sistema usa API REST.",
      type: "new_automation",
      status: "OPEN",
      priority: "high",
    },
  });

  await prisma.request.create({
    data: {
      organizationId: demoOrg.id,
      title: "El bot no responde después de las 10pm",
      description: "Los pacientes reportan que el asistente de WhatsApp no responde pasadas las 10pm. Necesitamos que funcione 24/7.",
      type: "support",
      status: "IN_PROGRESS",
      priority: "high",
    },
  });
  console.log("✅ Demo requests created");

  // ─── Phase 2: WhatsApp Assistant ─────────────────────────────────
  await prisma.whatsAppAssistant.upsert({
    where: { organizationId: demoOrg.id },
    update: {},
    create: {
      organizationId: demoOrg.id,
      name: "Dr. Bot — Asistente Clínica San Rafael",
      greeting: "¡Hola! Soy el asistente virtual de Clínica San Rafael. Puedo ayudarte a agendar citas, resolver dudas sobre nuestros servicios y más. ¿En qué puedo ayudarte hoy?",
      personality: "Soy amable, profesional y empático. Me enfoco en entender las necesidades del paciente y ofrecer soluciones rápidas. Siempre me dirijo al paciente por su nombre cuando lo conozco.",
      capabilities: ["appointments", "faq", "lead_capture", "follow_up", "escalation"],
      isActive: true,
      phoneNumber: "+52 55 1234 0000",
    },
  });
  console.log("✅ WhatsApp assistant created");

  // ─── Phase 2: Knowledge Base ──────────────────────────────────────
  const kbArticles = [
    {
      title: "Horarios de atención",
      content: "Clínica San Rafael atiende de lunes a viernes de 8:00am a 8:00pm, y sábados de 9:00am a 2:00pm. Los domingos y días festivos permanecemos cerrados.",
      category: "general",
      tags: ["horario", "atención"],
    },
    {
      title: "Especialidades médicas disponibles",
      content: "Contamos con las siguientes especialidades: Medicina General, Pediatría, Ginecología, Cardiología, Dermatología, Nutrición, Psicología y Odontología.",
      category: "servicios",
      tags: ["especialidades", "médicos"],
    },
    {
      title: "Cómo agendar una cita",
      content: "Puedes agendar tu cita por WhatsApp con nuestro asistente virtual, llamando al 55 1234 0000, o visitando nuestra clínica directamente. Las citas de urgencia se atienden el mismo día.",
      category: "citas",
      tags: ["citas", "agenda"],
    },
    {
      title: "Costos de consulta",
      content: "Consulta de medicina general: $500 MXN. Especialidades: $700-900 MXN según especialidad. Aceptamos efectivo, tarjeta y transferencia. También manejamos seguros médicos principales.",
      category: "precios",
      tags: ["costos", "precios", "seguros"],
    },
    {
      title: "Preparación para análisis de laboratorio",
      content: "Para análisis de sangre en ayuno: no consumir alimentos 8-12 horas antes. Solo agua es permitida. Para análisis generales sin ayuno puedes llegar a cualquier hora. Nuestro laboratorio abre de 7am a 5pm.",
      category: "servicios",
      tags: ["laboratorio", "análisis"],
    },
  ];

  for (const article of kbArticles) {
    await prisma.knowledgeBase.create({
      data: { ...article, organizationId: demoOrg.id },
    });
  }
  console.log("✅ Knowledge base articles created");

  // ─── Phase 2: Prompts ─────────────────────────────────────────────
  await prisma.prompt.create({
    data: {
      organizationId: demoOrg.id,
      name: "Sistema v1 — Clínica San Rafael",
      type: "SYSTEM",
      isActive: true,
      content: `Eres el asistente virtual de Clínica San Rafael, una clínica médica de prestigio en Ciudad de México.

Tu nombre es "Dr. Bot" y tu objetivo es:
1. Agendar citas médicas de forma rápida y eficiente
2. Responder preguntas sobre servicios, horarios y precios
3. Capturar datos de leads interesados en nuestros servicios
4. Escalar a un agente humano cuando el paciente lo solicite o la situación lo requiera

REGLAS IMPORTANTES:
- Siempre sé amable, empático y profesional
- No proporciones diagnósticos médicos bajo ninguna circunstancia
- Si el paciente menciona una emergencia, proporciona de inmediato el número de emergencias: 55 1234 0000
- Cuando no tengas información sobre algo, ofrece escalar con un humano
- Responde siempre en español`,
    },
  });

  await prisma.prompt.create({
    data: {
      organizationId: demoOrg.id,
      name: "Calificación de leads v1",
      type: "LEAD_QUALIFICATION",
      isActive: true,
      content: `Para calificar a un lead, obtén la siguiente información:
1. Nombre completo
2. Número de teléfono de contacto
3. Especialidad o tipo de consulta que necesita
4. Disponibilidad de horario preferida
5. Si tiene seguro médico (opcional)

Una vez obtenidos estos datos, confirma la información y ofrece agendar la cita.`,
    },
  });
  console.log("✅ Demo prompts created");

  // ─── Phase 2: AI scored lead ──────────────────────────────────────
  await prisma.lead.updateMany({
    where: { organizationId: demoOrg.id, name: "Roberto Sánchez" },
    data: {
      score: 87,
      scoreReason: "Empresa grande (>50 empleados), presupuesto disponible, decisor confirmado, timeline de 30 días.",
    },
  });

  await prisma.lead.updateMany({
    where: { organizationId: demoOrg.id, name: "María García" },
    data: { score: 62, scoreReason: "Interés genuino, presupuesto no confirmado, necesita consultar con familia." },
  });
  console.log("✅ Lead scores updated");

  // ─── Phase 2: Escalated conversation ─────────────────────────────
  await prisma.conversation.create({
    data: {
      organizationId: demoOrg.id,
      channel: "whatsapp",
      contactPhone: "+52 55 9876 0001",
      contactName: "Pedro Ortiz",
      status: "ESCALATED",
      aiHandled: false,
      escalatedAt: new Date(),
      messages: {
        create: [
          { role: "USER", content: "Necesito hablar urgentemente con alguien de la clínica" },
          { role: "ASSISTANT", content: "Entiendo que tienes una situación urgente. ¿Puedes contarme más para poder ayudarte mejor?" },
          { role: "USER", content: "Es por mi hijo, tuvo una reacción alérgica y necesito orientación médica" },
          { role: "ASSISTANT", content: "Por la urgencia de la situación, estoy transfiriendo esta conversación a un agente de nuestra clínica. Por favor mantén la comunicación activa." },
          { role: "SYSTEM", content: "Conversación escalada al equipo humano por urgencia médica." },
        ],
      },
    },
  });
  console.log("✅ Escalated conversation created");

  // ─── Phase 3: Automation Templates ───────────────────────────────
  const templateDefs = [
    {
      id: "tmpl-clinic-leads",
      name: "Captura de Leads — Clínica",
      description: "Captura automáticamente pacientes potenciales desde WhatsApp, califica su urgencia y agenda una cita de primer contacto.",
      longDescription: "Este template instala un flujo completo de captura de leads para clínicas y consultorios. El asistente IA recibe mensajes de WhatsApp, extrae datos del paciente (nombre, motivo de consulta, disponibilidad), califica la urgencia y agenda automáticamente una cita de valoración.",
      industry: "clinic",
      category: "lead_capture",
      iconEmoji: "🏥",
      isPublished: true,
      currentVersion: "1.0.0",
      n8nWorkflowId: "tmpl-wf-clinic-leads",
    },
    {
      id: "tmpl-real-estate-leads",
      name: "Calificación de Leads — Inmobiliaria",
      description: "Califica leads de compradores y arrendatarios con preguntas clave: presupuesto, zona, tipo de propiedad y timeline.",
      longDescription: "Automatiza la calificación inicial de prospectos inmobiliarios. El bot pregunta por presupuesto, zona de interés, número de habitaciones y urgencia. Asigna un score automático y notifica al agente cuando el lead es de alta calidad.",
      industry: "real_estate",
      category: "lead_capture",
      iconEmoji: "🏠",
      isPublished: true,
      currentVersion: "1.0.0",
      n8nWorkflowId: "tmpl-wf-realestate-leads",
    },
    {
      id: "tmpl-gym-retention",
      name: "Retención de Membresías — Gimnasio",
      description: "Detecta membresías por vencer y activa una secuencia de reactivación automática por WhatsApp con oferta personalizada.",
      longDescription: "3 días antes de que venza una membresía, el sistema envía un mensaje personalizado con una oferta de renovación. Si no responde en 24h, envía un recordatorio final. Registra la tasa de retención en el dashboard.",
      industry: "gym",
      category: "retention",
      iconEmoji: "💪",
      isPublished: true,
      currentVersion: "1.0.0",
      n8nWorkflowId: "tmpl-wf-gym-retention",
    },
    {
      id: "tmpl-legal-appointments",
      name: "Agendamiento de Consultas — Legal",
      description: "Agenda consultas legales iniciales, recopila información del caso y envía confirmación con recordatorio 24h antes.",
      longDescription: "El asistente califica el tipo de caso (civil, laboral, familiar, corporativo), verifica la urgencia y agenda la consulta con el abogado disponible. Envía confirmación por WhatsApp y un recordatorio automático 24 horas antes.",
      industry: "legal",
      category: "appointments",
      iconEmoji: "⚖️",
      isPublished: true,
      currentVersion: "1.0.0",
      n8nWorkflowId: "tmpl-wf-legal-appointments",
    },
    {
      id: "tmpl-workshop-followup",
      name: "Seguimiento Post-Servicio — Taller",
      description: "Envía encuesta de satisfacción 24h después de cada servicio y activa una oferta de mantenimiento preventivo.",
      longDescription: "Cuando se marca un servicio como completado, el sistema espera 24 horas y envía una encuesta de satisfacción de 3 preguntas. Si la calificación es ≥4/5 pide una reseña en Google. A los 3 meses envía recordatorio de mantenimiento preventivo.",
      industry: "workshop",
      category: "follow_up",
      iconEmoji: "🔧",
      isPublished: true,
      currentVersion: "1.0.0",
      n8nWorkflowId: "tmpl-wf-workshop-followup",
    },
    {
      id: "tmpl-ecommerce-abandoned",
      name: "Recuperación de Carritos — E-commerce",
      description: "Detecta carritos abandonados y activa una secuencia de 3 mensajes en 48h para recuperar la venta con descuento progresivo.",
      longDescription: "Cuando un usuario abandona el carrito, el sistema activa una secuencia: mensaje 1 a las 2h (recordatorio simple), mensaje 2 a las 24h (10% descuento), mensaje 3 a las 48h (15% descuento último aviso). Tasa de recuperación promedio: 18%.",
      industry: "ecommerce",
      category: "retention",
      iconEmoji: "🛒",
      isPublished: true,
      currentVersion: "1.1.0",
      n8nWorkflowId: "tmpl-wf-ecommerce-abandoned",
    },
  ];

  const n8nWorkflowSkeleton = {
    nodes: [
      { id: "trigger", type: "n8n-nodes-base.webhook", name: "Webhook Trigger", position: [240, 300] },
      { id: "process", type: "n8n-nodes-base.function", name: "Process Data", position: [460, 300] },
      { id: "respond", type: "n8n-nodes-base.httpRequest", name: "Send Response", position: [680, 300] },
    ],
    connections: {
      trigger: { main: [[{ node: "process", type: "main", index: 0 }]] },
      process: { main: [[{ node: "respond", type: "main", index: 0 }]] },
    },
  };

  for (const def of templateDefs) {
    const { n8nWorkflowId, currentVersion, ...templateData } = def;

    const template = await prisma.automationTemplate.upsert({
      where: { id: def.id },
      update: {},
      create: {
        ...templateData,
        versions: {
          create: {
            version: currentVersion,
            isLatest: true,
            changelog: "Versión inicial",
            n8nWorkflowId,
            n8nWorkflowJson: n8nWorkflowSkeleton,
            defaultConfig: { triggerType: "webhook", language: "es", timezone: "America/Mexico_City" },
          },
        },
      },
    });
    console.log(`✅ Template created: ${template.name}`);
  }

  // Install the clinic leads template on the demo org
  const clinicTemplate = await prisma.automationTemplate.findUnique({
    where: { id: "tmpl-clinic-leads" },
    include: { versions: { where: { isLatest: true }, take: 1 } },
  });

  if (clinicTemplate && clinicTemplate.versions[0]) {
    const existingInstall = await prisma.templateInstallation.findUnique({
      where: { organizationId_templateId: { organizationId: demoOrg.id, templateId: clinicTemplate.id } },
    });

    if (!existingInstall) {
      await prisma.templateInstallation.create({
        data: {
          organizationId: demoOrg.id,
          templateId: clinicTemplate.id,
          versionId: clinicTemplate.versions[0].id,
          status: "ACTIVE",
        },
      });
      console.log("✅ Clinic leads template installed on demo org");
    }
  }

  console.log("\n✅ Seed completed successfully!");
  console.log("\n📋 Demo credentials:");
  console.log("  Admin  → admin@reymen.io / admin123456");
  console.log("  Clínica → carlos@clinicasanrafael.com / client123456");
  console.log("  Wolf   → ricardo@tallerwolf.com / Wolf$Ricardo2024");
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
