"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, Plus, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createPrompt, updatePrompt } from "@/actions/prompts";
import { usePreferences } from "@/context/preferences";
import type { Prompt, PromptType } from "@prisma/client";

const PROMPT_TYPE_LABELS_ES: Record<PromptType, string> = {
  SYSTEM: "Sistema (principal)",
  GREETING: "Saludo inicial",
  LEAD_QUALIFICATION: "Calificación de leads",
  APPOINTMENT_BOOKING: "Agendamiento de citas",
  FAQ: "Preguntas frecuentes",
  ESCALATION: "Escalación",
};

const PROMPT_TYPE_LABELS_EN: Record<PromptType, string> = {
  SYSTEM: "System (main)",
  GREETING: "Initial greeting",
  LEAD_QUALIFICATION: "Lead qualification",
  APPOINTMENT_BOOKING: "Appointment booking",
  FAQ: "FAQ",
  ESCALATION: "Escalation",
};

const schema = z.object({
  name: z.string().min(1),
  content: z.string().min(10),
  type: z.enum(["SYSTEM", "GREETING", "LEAD_QUALIFICATION", "APPOINTMENT_BOOKING", "FAQ", "ESCALATION"]),
});

type FormData = z.infer<typeof schema>;

interface PromptDialogProps {
  prompt?: Prompt;
  mode?: "create" | "edit";
  defaultType?: PromptType;
}

export function PromptDialog({ prompt, mode = "create", defaultType }: PromptDialogProps) {
  const { lang } = usePreferences();
  const promptTypeLabels = lang === "es" ? PROMPT_TYPE_LABELS_ES : PROMPT_TYPE_LABELS_EN;
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const { register, handleSubmit, setValue, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: prompt
      ? { name: prompt.name, content: prompt.content, type: prompt.type }
      : { type: defaultType },
  });

  async function onSubmit(data: FormData) {
    setLoading(true);
    try {
      if (mode === "edit" && prompt) {
        await updatePrompt(prompt.id, data);
        toast.success(lang === "es" ? "Prompt actualizado" : "Prompt updated");
      } else {
        await createPrompt(data);
        toast.success(lang === "es" ? "Prompt creado" : "Prompt created");
        reset();
      }
      setOpen(false);
    } catch {
      toast.error(lang === "es" ? "Error al guardar prompt" : "Error saving prompt");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {mode === "create" ? (
          <Button size="sm" variant="outline">
            <Plus className="h-4 w-4" />
            {lang === "es" ? "Nuevo prompt" : "New prompt"}
          </Button>
        ) : (
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <Pencil className="h-4 w-4" />
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? (lang === "es" ? "Crear prompt" : "Create prompt") : (lang === "es" ? "Editar prompt" : "Edit prompt")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>{lang === "es" ? "Nombre" : "Name"}</Label>
              <Input placeholder={lang === "es" ? "Prompt sistema v2" : "System prompt v2"} {...register("name")} />
              {errors.name && <p className="text-xs text-red-500">{errors.name.message}</p>}
            </div>
            {mode === "create" && (
              <div className="space-y-2">
                <Label>{lang === "es" ? "Tipo" : "Type"}</Label>
                <Select
                  defaultValue={defaultType}
                  onValueChange={(v) => setValue("type", v as PromptType)}
                >
                  <SelectTrigger><SelectValue placeholder={lang === "es" ? "Seleccionar tipo" : "Select type"} /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(promptTypeLabels).map(([v, l]) => (
                      <SelectItem key={v} value={v}>{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.type && <p className="text-xs text-red-500">{errors.type.message}</p>}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label>{lang === "es" ? "Contenido del prompt" : "Prompt content"}</Label>
            <Textarea
              placeholder={lang === "es" ? "Eres un asistente virtual de [empresa]. Tu objetivo es..." : "You are a virtual assistant for [company]. Your goal is..."}
              rows={10}
              className="font-mono text-xs"
              {...register("content")}
            />
            {errors.content && <p className="text-xs text-red-500">{errors.content.message}</p>}
            <p className="text-xs text-slate-400">
              {lang === "es" ? "Puedes usar variables como" : "You can use variables like"} {`{{nombre_empresa}}`}, {`{{horario}}`}, {`{{servicios}}`}.
            </p>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>{lang === "es" ? "Cancelar" : "Cancel"}</Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {lang === "es" ? "Guardar" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
