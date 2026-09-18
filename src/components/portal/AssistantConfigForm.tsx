"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { upsertWhatsAppAssistant } from "@/actions/whatsapp-assistant";
import { usePreferences } from "@/context/preferences";
import type { WhatsAppAssistant } from "@prisma/client";

const schema = z.object({
  name: z.string().min(1),
  greeting: z.string().min(10),
  personality: z.string().optional(),
  phoneNumber: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

interface AssistantConfigFormProps {
  assistant: WhatsAppAssistant | null;
}

export function AssistantConfigForm({ assistant }: AssistantConfigFormProps) {
  const { t } = usePreferences();
  const [loading, setLoading] = useState(false);
  const [capabilities, setCapabilities] = useState<string[]>(
    assistant?.capabilities ?? []
  );

  const ALL_CAPABILITIES = [
    { value: "lead_capture", label: t.capLeadCapture },
    { value: "appointments", label: t.capAppointments },
    { value: "faq", label: t.capFaq },
    { value: "follow_up", label: t.capFollowUp },
    { value: "qualification", label: t.capQualification },
    { value: "escalation", label: t.capEscalation },
  ];

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: assistant?.name ?? t.assistantNamePlaceholder,
      greeting: assistant?.greeting ?? t.assistantGreetingDefault,
      personality: assistant?.personality ?? "",
      phoneNumber: assistant?.phoneNumber ?? "",
    },
  });

  function toggleCapability(value: string) {
    setCapabilities((prev) =>
      prev.includes(value) ? prev.filter((c) => c !== value) : [...prev, value]
    );
  }

  async function onSubmit(data: FormData) {
    setLoading(true);
    try {
      await upsertWhatsAppAssistant({ ...data, capabilities });
      toast.success(t.assistantSaved);
    } catch {
      toast.error(t.assistantSaveError);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>{t.assistantName}</Label>
          <Input placeholder={t.assistantNamePlaceholder} {...register("name")} />
          {errors.name && <p className="text-xs text-red-500">{errors.name.message}</p>}
        </div>
        <div className="space-y-2">
          <Label>{t.whatsappBusinessNumber}</Label>
          <Input placeholder="+52 55 1234 5678" {...register("phoneNumber")} />
        </div>
      </div>

      <div className="space-y-2">
        <Label>{t.initialGreeting}</Label>
        <Textarea
          placeholder={t.greetingPlaceholder}
          rows={3}
          {...register("greeting")}
        />
        {errors.greeting && <p className="text-xs text-red-500">{errors.greeting.message}</p>}
      </div>

      <div className="space-y-2">
        <Label>{t.personalityStyle}</Label>
        <Textarea
          placeholder={t.personalityPlaceholder}
          rows={3}
          {...register("personality")}
        />
        <p className="text-xs text-slate-400">{t.personalityHint}</p>
      </div>

      <div className="space-y-3">
        <Label>{t.activeCapabilities}</Label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {ALL_CAPABILITIES.map((cap) => (
            <button
              key={cap.value}
              type="button"
              onClick={() => toggleCapability(cap.value)}
              className={`rounded-md border px-3 py-2 text-sm font-medium text-left transition-colors ${
                capabilities.includes(cap.value)
                  ? "border-brand-500 bg-brand-50 text-brand-700"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              {cap.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {t.saveConfig}
        </Button>
      </div>
    </form>
  );
}
