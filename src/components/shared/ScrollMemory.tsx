"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

/**
 * El contenido se desplaza dentro de <main>, no en la ventana, así que el
 * navegador no recuerda dónde ibas al volver atrás (el gesto de deslizar en
 * celular). Aquí se guarda la posición de cada pantalla y se recupera solo
 * cuando se regresa con "atrás"; al entrar a una pantalla nueva se empieza
 * desde arriba.
 */
const KEY = "reymen-scroll:";

function main(): HTMLElement | null {
  return document.querySelector("main");
}

export function ScrollMemory() {
  const pathname = usePathname();
  const current = useRef(pathname);
  const popped = useRef(false);

  useEffect(() => {
    const el = main();
    if (!el) return;
    const onPop = () => {
      popped.current = true;
    };
    const onScroll = () => {
      try {
        sessionStorage.setItem(KEY + current.current, String(el.scrollTop));
      } catch {
        /* sin almacenamiento: no se recuerda */
      }
    };
    window.addEventListener("popstate", onPop);
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("popstate", onPop);
      el.removeEventListener("scroll", onScroll);
    };
  }, []);

  useEffect(() => {
    const el = main();
    if (!el) return;
    const back = popped.current;
    popped.current = false;
    let saved = 0;
    if (back) {
      try {
        saved = Number(sessionStorage.getItem(KEY + pathname)) || 0;
      } catch {
        /* ignore */
      }
    }
    // Se fija la ruta nueva antes de mover el scroll para no pisar la anterior.
    current.current = pathname;
    if (saved <= 0) {
      el.scrollTop = 0;
      return;
    }
    // El contenido puede tardar en pintarse: se reintenta unos cuadros.
    let tries = 0;
    let raf = 0;
    const apply = () => {
      el.scrollTop = saved;
      if (Math.abs(el.scrollTop - saved) > 2 && tries++ < 20) raf = requestAnimationFrame(apply);
    };
    apply();
    return () => cancelAnimationFrame(raf);
  }, [pathname]);

  return null;
}
