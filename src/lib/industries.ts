// Pure module — importable from client and server contexts.
// Nombres de industria de plantillas y paquetes. Antes el mismo mapa estaba
// copiado en cinco páginas (portal/templates y cuatro de admin).

import type { Lang } from "./i18n";

export const INDUSTRY_LABELS: Record<Lang, Record<string, string>> = {
  es: {
    clinic: "Clínica / Salud",
    real_estate: "Inmobiliaria",
    gym: "Gimnasio",
    legal: "Legal",
    workshop: "Taller",
    ecommerce: "E-commerce",
    restaurant: "Restaurante",
    education: "Educación",
    general: "General",
  },
  en: {
    clinic: "Clinic / Health",
    real_estate: "Real Estate",
    gym: "Gym",
    legal: "Legal",
    workshop: "Workshop",
    ecommerce: "E-commerce",
    restaurant: "Restaurant",
    education: "Education",
    general: "General",
  },
};
