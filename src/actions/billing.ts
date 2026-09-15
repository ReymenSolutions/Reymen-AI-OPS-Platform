"use server";

import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { getStripeClient, isStripeConfigured, PLAN_PRICE_ENV } from "@/lib/stripe";
import type { UserRole } from "@prisma/client";

async function requireBillingManager() {
  const session = await auth();
  if (!session?.user.organizationId) throw new Error("No autorizado");
  if (!can(session.user.role as UserRole, "settings:manage")) throw new Error("Sin permisos");
  return session;
}

async function getOrCreateStripeCustomer(orgId: string): Promise<string> {
  const stripe = getStripeClient();
  if (!stripe) throw new Error("La facturación no está configurada");

  const org = await prisma.organization.findUniqueOrThrow({ where: { id: orgId } });
  if (org.stripeCustomerId) return org.stripeCustomerId;

  const customer = await stripe.customers.create({
    name: org.name,
    metadata: { organizationId: org.id },
  });
  await prisma.organization.update({
    where: { id: orgId },
    data: { stripeCustomerId: customer.id },
  });
  return customer.id;
}

/** Starts a Stripe Checkout session to subscribe the org to a paid plan. Returns the URL to redirect to. */
export async function createCheckoutSession(plan: "professional" | "enterprise"): Promise<{ url: string }> {
  const session = await requireBillingManager();
  const stripe = getStripeClient();
  if (!stripe) throw new Error("La facturación no está configurada");

  const priceId = PLAN_PRICE_ENV[plan];
  if (!priceId) throw new Error(`No hay un precio de Stripe configurado para el plan ${plan}`);

  const customerId = await getOrCreateStripeCustomer(session.user.organizationId!);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  const checkoutSession = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${appUrl}/portal/settings?billing=success`,
    cancel_url: `${appUrl}/portal/settings?billing=cancelled`,
    metadata: { organizationId: session.user.organizationId!, plan },
  });

  if (!checkoutSession.url) throw new Error("No se pudo crear la sesión de pago");
  return { url: checkoutSession.url };
}

/** Opens Stripe's hosted billing portal so the org can manage/cancel their existing subscription. */
export async function createBillingPortalSession(): Promise<{ url: string }> {
  const session = await requireBillingManager();
  const stripe = getStripeClient();
  if (!stripe) throw new Error("La facturación no está configurada");

  const org = await prisma.organization.findUniqueOrThrow({ where: { id: session.user.organizationId! } });
  if (!org.stripeCustomerId) throw new Error("Esta organización aún no tiene una suscripción");

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const portalSession = await stripe.billingPortal.sessions.create({
    customer: org.stripeCustomerId,
    return_url: `${appUrl}/portal/settings`,
  });

  return { url: portalSession.url };
}

export async function getBillingInfo(): Promise<{
  stripeEnabled: boolean;
  plan: string;
  hasActiveSubscription: boolean;
}> {
  const session = await auth();
  if (!session?.user.organizationId) throw new Error("No autorizado");

  const org = await prisma.organization.findUniqueOrThrow({ where: { id: session.user.organizationId } });
  return {
    stripeEnabled: isStripeConfigured(),
    plan: org.plan,
    hasActiveSubscription: org.stripeSubscriptionStatus === "active" || org.stripeSubscriptionStatus === "trialing",
  };
}
