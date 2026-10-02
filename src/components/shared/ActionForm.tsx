"use client";

import { useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { usePreferences } from "@/context/preferences";
import { getErrorMessage } from "@/lib/user-error";

/**
 * Formulario que llama a una acción de servidor que recibe FormData.
 *
 * Con <form action={accionDeServidor}> directo, cualquier error que lance la
 * acción ("Ya existe un insumo con ese nombre", datos inválidos, un doble
 * clic que manda el formulario dos veces) tumba la página completa a la
 * pantalla de error. Aquí el error se muestra como aviso, el formulario se
 * desactiva mientras guarda (no hay doble envío) y se limpia al guardar.
 */
export function ActionForm({
  action,
  successMessage,
  className,
  children,
}: {
  action: (formData: FormData) => Promise<void>;
  successMessage: { es: string; en: string };
  className?: string;
  children: ReactNode;
}) {
  const { lang } = usePreferences();
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    const form = e.currentTarget;
    const data = new FormData(form);
    startTransition(async () => {
      try {
        await action(data);
        form.reset();
        toast.success(lang === "en" ? successMessage.en : successMessage.es);
      } catch (err) {
        toast.error(getErrorMessage(err, lang === "en" ? "Couldn't save" : "No se pudo guardar"));
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className={className} aria-busy={pending}>
      <fieldset disabled={pending} className="contents">
        {children}
      </fieldset>
    </form>
  );
}
