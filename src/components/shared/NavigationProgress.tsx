"use client";

import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * Barra delgada arriba que aparece en cuanto se toca un enlace interno y se
 * va cuando la pantalla nueva ya cambió. Así nunca hay un "silencio" entre el
 * toque y la respuesta, aunque la página tarde en llegar del servidor.
 */
export function NavigationProgress() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const [active, setActive] = useState(false);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || (a.target && a.target !== "_self") || a.hasAttribute("download")) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      setActive(true);
    }
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  // La pantalla ya cambió: se quita la barra.
  useEffect(() => {
    setActive(false);
  }, [pathname, search]);

  // Por si el clic nunca llega a navegar (error, cancelado): no se queda pegada.
  useEffect(() => {
    if (!active) return;
    const id = setTimeout(() => setActive(false), 10_000);
    return () => clearTimeout(id);
  }, [active]);

  if (!active) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-1" role="progressbar" aria-label="Cargando">
      <div className="h-full origin-left bg-brand-500 shadow-[0_0_8px_var(--color-brand-500,#3b82f6)]" style={{ animation: "nav-progress 8s ease-out forwards" }} />
    </div>
  );
}
