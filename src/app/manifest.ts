import type { MetadataRoute } from "next";

/** "Agregar a pantalla de inicio" (Android/Chrome) usa este nombre e ícono. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ReymenApp",
    short_name: "ReymenApp",
    description: "Automatización inteligente para hacer crecer tu negocio.",
    start_url: "/",
    display: "standalone",
    background_color: "#0b1a5c",
    theme_color: "#0b1a5c",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
