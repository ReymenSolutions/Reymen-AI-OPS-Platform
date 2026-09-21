// Seeds enough data to actually exercise pagination + gives the perf
// benchmarks something realistic to measure against. Idempotent-ish: uses a
// fixed slug so re-running just adds more (fine for this purpose — not meant
// for CI, only for manual scale testing in a scratch environment).
import { PrismaClient } from "@prisma/client";
import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// Scratch-environment-only credential, not meant for any real deployment —
// see the file header. Needed so perf scripts can actually log in as this
// user rather than just seeding unreachable data.
export const SCALE_TEST_PASSWORD = "ScaleTest123456";

function secret() {
  return randomBytes(32).toString("hex");
}

async function main() {
  const org = await prisma.organization.upsert({
    where: { slug: "scale-test-org" },
    update: {},
    create: {
      name: "Scale Test Org",
      slug: "scale-test-org",
      industry: "general",
      plan: "enterprise",
      n8nWebhookSecret: secret(),
    },
  });
  console.log("org:", org.id);

  for (const mod of ["CRM", "AI_WHATSAPP", "AUTOMATIONS"]) {
    await prisma.organizationModule.upsert({
      where: { organizationId_module: { organizationId: org.id, module: mod } },
      update: {},
      create: { organizationId: org.id, module: mod, status: "ACTIVE", source: "SUBSCRIBED" },
    });
  }

  const passwordHash = await bcrypt.hash(SCALE_TEST_PASSWORD, 12);
  await prisma.user.upsert({
    where: { email: "scale@test.local" },
    update: { passwordHash },
    create: {
      email: "scale@test.local",
      name: "Scale Test User",
      role: "OWNER",
      organizationId: org.id,
      passwordHash,
      isActive: true,
    },
  });

  const existingLeads = await prisma.lead.count({ where: { organizationId: org.id } });
  const LEAD_TARGET = 300;
  if (existingLeads < LEAD_TARGET) {
    const statuses = ["NEW", "CONTACTED", "QUALIFIED", "PROPOSAL", "WON", "LOST"];
    const sources = ["whatsapp", "web", "referral", "manual"];
    const batch = [];
    for (let i = existingLeads; i < LEAD_TARGET; i++) {
      batch.push({
        organizationId: org.id,
        name: `Lead de Prueba ${i}`,
        email: `lead${i}@scaletest.local`,
        phone: `+52 55 ${String(i).padStart(4, "0")} 0000`,
        source: sources[i % sources.length],
        status: statuses[i % statuses.length],
        score: i % 100,
        createdAt: new Date(Date.now() - i * 60_000),
      });
    }
    await prisma.lead.createMany({ data: batch });
    console.log(`created ${batch.length} leads`);
  } else {
    console.log(`already have ${existingLeads} leads, skipping`);
  }

  const existingConvs = await prisma.conversation.count({ where: { organizationId: org.id } });
  const CONV_TARGET = 120;
  if (existingConvs < CONV_TARGET) {
    for (let i = existingConvs; i < CONV_TARGET; i++) {
      const conv = await prisma.conversation.create({
        data: {
          organizationId: org.id,
          channel: i % 3 === 0 ? "web" : "whatsapp",
          contactPhone: `+52 55 9${String(i).padStart(3, "0")} 0000`,
          contactName: `Contacto ${i}`,
          status: ["OPEN", "ESCALATED", "RESOLVED"][i % 3],
          updatedAt: new Date(Date.now() - i * 30_000),
        },
      });

      // Give the first 5 conversations a long thread (150+ messages) so
      // "load older messages" pagination has something real to page through.
      const messageCount = i < 5 ? 150 : 3 + (i % 8);
      const messages = [];
      for (let m = 0; m < messageCount; m++) {
        messages.push({
          conversationId: conv.id,
          role: m % 2 === 0 ? "USER" : "ASSISTANT",
          content: `Mensaje de prueba número ${m} en la conversación ${i}. Lorem ipsum dolor sit amet.`,
          createdAt: new Date(Date.now() - (messageCount - m) * 1000),
        });
      }
      await prisma.message.createMany({ data: messages });
    }
    console.log(`created ${CONV_TARGET - existingConvs} conversations with messages`);
  } else {
    console.log(`already have ${existingConvs} conversations, skipping`);
  }

  console.log("done");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
