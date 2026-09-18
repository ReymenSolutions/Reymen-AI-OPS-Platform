"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { skipOnboarding } from "@/actions/onboarding";
import { usePreferences } from "@/context/preferences";

export function SkipOnboardingButton({ className }: { className?: string }) {
  const { lang } = usePreferences();
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleSkip() {
    startTransition(async () => {
      try {
        await skipOnboarding();
        toast.success(lang === "es" ? "Configuración marcada como completada" : "Setup marked as complete");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : (lang === "es" ? "Error al actualizar" : "Error updating"));
      }
    });
  }

  return (
    <Button variant="outline" size="sm" onClick={handleSkip} disabled={isPending} className={className}>
      {lang === "es" ? "Marcar como completado" : "Mark as complete"}
    </Button>
  );
}
