"use client";

import { useState } from "react";
import { Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { activatePrompt } from "@/actions/prompts";
import { usePreferences } from "@/context/preferences";
import type { PromptType } from "@prisma/client";

interface ActivatePromptButtonProps {
  id: string;
  type: PromptType;
  isActive: boolean;
}

export function ActivatePromptButton({ id, type, isActive }: ActivatePromptButtonProps) {
  const { lang } = usePreferences();
  const [loading, setLoading] = useState(false);

  async function handleActivate() {
    if (isActive) return;
    setLoading(true);
    try {
      await activatePrompt(id, type);
      toast.success(lang === "es" ? "Prompt activado" : "Prompt activated");
    } catch {
      toast.error(lang === "es" ? "Error al activar prompt" : "Error activating prompt");
    } finally {
      setLoading(false);
    }
  }

  if (isActive) {
    return (
      <span className="flex items-center gap-1 text-xs font-medium text-emerald-600">
        <CheckCircle2 className="h-3.5 w-3.5" />
        {lang === "es" ? "Activo" : "Active"}
      </span>
    );
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleActivate}
      disabled={loading}
      className="text-xs h-7"
    >
      {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
      {lang === "es" ? "Activar" : "Activate"}
    </Button>
  );
}
