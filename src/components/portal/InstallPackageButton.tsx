"use client";

import { useState } from "react";
import { Loader2, PackageCheck, PackagePlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { installTemplatePackage } from "@/actions/templates";
import { usePreferences } from "@/context/preferences";

interface InstallPackageButtonProps {
  packageId: string;
  fullyInstalled: boolean;
}

export function InstallPackageButton({ packageId, fullyInstalled }: InstallPackageButtonProps) {
  const { lang } = usePreferences();
  const [loading, setLoading] = useState(false);
  const [installed, setInstalled] = useState(fullyInstalled);

  async function handleInstall() {
    setLoading(true);
    try {
      const result = await installTemplatePackage(packageId);
      setInstalled(result.limitReached ? installed : true);
      if (result.limitReached) {
        toast.warning(
          lang === "es"
            ? `Instalamos ${result.installedCount} template(s), pero alcanzaste el límite de automatizaciones de tu plan. Solicita más capacidad en Configuración para instalar el resto.`
            : `We installed ${result.installedCount} template(s), but you reached your plan's automation limit. Request more capacity in Settings to install the rest.`
        );
      } else if (result.installedCount === 0) {
        toast.success(lang === "es" ? "Este paquete ya estaba instalado por completo" : "This package was already fully installed");
      } else {
        toast.success(
          lang === "es"
            ? `Paquete instalado: ${result.installedCount} automatización(es) activada(s)${result.skippedCount > 0 ? `, ${result.skippedCount} ya estaban instaladas` : ""}`
            : `Package installed: ${result.installedCount} automation(s) activated${result.skippedCount > 0 ? `, ${result.skippedCount} already installed` : ""}`
        );
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : (lang === "es" ? "Error al instalar el paquete" : "Error installing the package"));
    } finally {
      setLoading(false);
    }
  }

  if (installed) {
    return (
      <Button variant="outline" size="sm" disabled className="text-emerald-600 border-emerald-200 bg-emerald-50">
        <PackageCheck className="h-4 w-4" />
        {lang === "es" ? "Paquete instalado" : "Package installed"}
      </Button>
    );
  }

  return (
    <Button size="sm" onClick={handleInstall} disabled={loading}>
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackagePlus className="h-4 w-4" />}
      {lang === "es" ? "Instalar paquete" : "Install package"}
    </Button>
  );
}
