"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { submitSmartcardFeedbackAction } from "@/actions/admin/smartcard-feedback";

export function SmartcardFeedbackForm() {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  async function handleSubmit() {
    if (!message.trim()) {
      toast.error("Escribe qué encontraste antes de enviar.");
      return;
    }
    setSending(true);
    const result = await submitSmartcardFeedbackAction(message);
    setSending(false);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success("Gracias — quedó registrado abajo.");
    setMessage("");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      <Textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        rows={3}
        maxLength={2000}
        placeholder="¿Qué encontraste? Ej. un botón que no responde, un dato que se ve mal..."
      />
      <Button className="w-fit" disabled={sending || !message.trim()} onClick={handleSubmit}>
        {sending && <Loader2 className="h-4 w-4 animate-spin" />}
        Enviar reporte
      </Button>
    </div>
  );
}
