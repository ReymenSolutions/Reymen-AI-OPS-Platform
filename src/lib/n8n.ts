import { createWebhookSignature } from "./webhook-validator";

const N8N_BASE_URL = process.env.N8N_BASE_URL ?? "http://localhost:5678";
const N8N_WEBHOOK_SECRET = process.env.N8N_WEBHOOK_SECRET ?? "";

export interface N8nTriggerPayload {
  organizationId: string;
  event: string;
  data: Record<string, unknown>;
}

export async function triggerN8nWorkflow(
  webhookPath: string,
  payload: N8nTriggerPayload
): Promise<{ success: boolean; error?: string }> {
  // webhookPath ends up in the request URL — restrict it to a safe path
  // segment so a caller can't smuggle "../" or an absolute/protocol-relative
  // URL into it and redirect the request off N8N_BASE_URL.
  if (!/^[a-zA-Z0-9_-]+$/.test(webhookPath)) {
    return { success: false, error: "Invalid webhookPath" };
  }

  const body = JSON.stringify(payload);
  const signature = createWebhookSignature(body, N8N_WEBHOOK_SECRET);

  try {
    const res = await fetch(`${N8N_BASE_URL}/webhook/${webhookPath}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Reymen-Signature": signature,
        "X-Reymen-Source": "platform",
      },
      body,
    });

    if (!res.ok) {
      return { success: false, error: `n8n returned ${res.status}` };
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
