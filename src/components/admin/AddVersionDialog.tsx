"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, Plus, GitBranch } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { addTemplateVersion } from "@/actions/admin/templates";
import { usePreferences } from "@/context/preferences";

const schema = z.object({
  version: z.string().regex(/^\d+\.\d+\.\d+$/, "Formato: 1.0.0"),
  changelog: z.string().optional(),
  n8nWorkflowJsonRaw: z.string().min(2, "Pega el JSON del workflow"),
  defaultConfigRaw: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

// Default n8n workflow skeleton so admins have a starting point
const DEFAULT_WORKFLOW_JSON = JSON.stringify({
  name: "Reymen - Template Workflow",
  nodes: [
    {
      id: "webhook-trigger",
      name: "Webhook Trigger",
      type: "n8n-nodes-base.webhook",
      position: [240, 300],
      parameters: { httpMethod: "POST", path: "reymen-template" },
    },
    {
      id: "process-data",
      name: "Procesar datos",
      type: "n8n-nodes-base.code",
      position: [460, 300],
      parameters: { jsCode: "return items;" },
    },
    {
      id: "callback",
      name: "Notificar plataforma",
      type: "n8n-nodes-base.httpRequest",
      position: [680, 300],
      parameters: {
        method: "POST",
        url: "={{$env.REYMEN_PLATFORM_URL}}/api/webhooks/n8n/automations",
      },
    },
  ],
  connections: {
    "webhook-trigger": { main: [[{ node: "process-data", type: "main", index: 0 }]] },
    "process-data": { main: [[{ node: "callback", type: "main", index: 0 }]] },
  },
  settings: { executionOrder: "v1" },
}, null, 2);

interface AddVersionDialogProps {
  templateId: string;
  templateName: string;
  currentVersion?: string | null;
}

export function AddVersionDialog({ templateId, templateName, currentVersion }: AddVersionDialogProps) {
  const { lang } = usePreferences();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { n8nWorkflowJsonRaw: DEFAULT_WORKFLOW_JSON },
  });

  async function onSubmit(data: FormData) {
    setLoading(true);
    try {
      let n8nWorkflowJson: Record<string, unknown>;
      let defaultConfig: Record<string, unknown> | undefined;

      try {
        n8nWorkflowJson = JSON.parse(data.n8nWorkflowJsonRaw);
      } catch {
        toast.error(lang === "es" ? "El JSON del workflow no es válido" : "The workflow JSON is not valid");
        return;
      }

      if (data.defaultConfigRaw?.trim()) {
        try {
          defaultConfig = JSON.parse(data.defaultConfigRaw);
        } catch {
          toast.error(lang === "es" ? "El JSON de configuración no es válido" : "The config JSON is not valid");
          return;
        }
      }

      await addTemplateVersion(templateId, {
        version: data.version,
        changelog: data.changelog,
        n8nWorkflowJson,
        defaultConfig,
      });

      toast.success(lang === "es" ? `Versión ${data.version} añadida` : `Version ${data.version} added`);
      reset();
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : (lang === "es" ? "Error al añadir versión" : "Error adding version"));
    } finally {
      setLoading(false);
    }
  }

  // Suggest next semver
  const suggestNext = () => {
    if (!currentVersion) return "1.0.0";
    const parts = currentVersion.split(".").map(Number);
    parts[2] += 1;
    return parts.join(".");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <GitBranch className="h-4 w-4" />
          {lang === "es" ? "Nueva versión" : "New version"}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{lang === "es" ? "Nueva versión" : "New version"} — {templateName}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>{lang === "es" ? "Número de versión *" : "Version number *"}</Label>
              <Input
                placeholder={suggestNext()}
                defaultValue={suggestNext()}
                {...register("version")}
              />
              {errors.version && <p className="text-xs text-red-500">{errors.version.message}</p>}
              {currentVersion && (
                <p className="text-xs text-slate-400">{lang === "es" ? "Versión actual" : "Current version"}: {currentVersion}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Changelog</Label>
              <Input placeholder={lang === "es" ? "Mejoras en la calificación de leads" : "Improvements to lead qualification"} {...register("changelog")} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>{lang === "es" ? "Workflow n8n (JSON) *" : "n8n workflow (JSON) *"}</Label>
            <Textarea
              rows={10}
              className="font-mono text-xs"
              {...register("n8nWorkflowJsonRaw")}
            />
            {errors.n8nWorkflowJsonRaw && (
              <p className="text-xs text-red-500">{errors.n8nWorkflowJsonRaw.message}</p>
            )}
            <p className="text-xs text-slate-400">
              {lang === "es" ? "Exporta el workflow desde n8n (menú ··· → Exportar) y pega el JSON aquí." : "Export the workflow from n8n (··· menu → Export) and paste the JSON here."}
            </p>
          </div>

          <div className="space-y-2">
            <Label>{lang === "es" ? "Config por defecto (JSON, opcional)" : "Default config (JSON, optional)"}</Label>
            <Textarea
              placeholder='{"company_name": "", "webhook_url": "", "follow_up_days": 3}'
              rows={3}
              className="font-mono text-xs"
              {...register("defaultConfigRaw")}
            />
            <p className="text-xs text-slate-400">
              {lang === "es" ? "Variables que el cliente puede personalizar al instalar." : "Variables the client can customize when installing."}
            </p>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>{lang === "es" ? "Cancelar" : "Cancel"}</Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {lang === "es" ? "Crear versión" : "Create version"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
