"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { skipOnboarding } from "@/actions/onboarding";

export function SkipOnboardingButton({ className }: { className?: string }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleSkip() {
    startTransition(async () => {
      try {
        await skipOnboarding();
        toast.success("Configuración marcada como completada");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Error al actualizar");
      }
    });
  }

  return (
    <Button variant="outline" size="sm" onClick={handleSkip} disabled={isPending} className={className}>
      Marcar como completado
    </Button>
  );
}
