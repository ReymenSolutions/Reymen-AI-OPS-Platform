"use client";

import { useState } from "react";
import { Loader2, PackageCheck, PackagePlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { installTemplatePackage } from "@/actions/templates";

interface InstallPackageButtonProps {
  packageId: string;
  fullyInstalled: boolean;
}

export function InstallPackageButton({ packageId, fullyInstalled }: InstallPackageButtonProps) {
  const [loading, setLoading] = useState(false);
  const [installed, setInstalled] = useState(fullyInstalled);

  async function handleInstall() {
    setLoading(true);
    try {
      const result = await installTemplatePackage(packageId);
      setInstalled(result.limitReached ? installed : true);
      if (result.limitReached) {
        toast.warning(
          `Instalamos ${result.installedCount} template(s), pero alcanzaste el límite de automatizaciones de tu plan. Solicita más capacidad en Configuración para instalar el resto.`
        );
      } else if (result.installedCount === 0) {
        toast.success("Este paquete ya estaba instalado por completo");
      } else {
        toast.success(`Paquete instalado: ${result.installedCount} automatización(es) activada(s)${result.skippedCount > 0 ? `, ${result.skippedCount} ya estaban instaladas` : ""}`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al instalar el paquete");
    } finally {
      setLoading(false);
    }
  }

  if (installed) {
    return (
      <Button variant="outline" size="sm" disabled className="text-emerald-600 border-emerald-200 bg-emerald-50">
        <PackageCheck className="h-4 w-4" />
        Paquete instalado
      </Button>
    );
  }

  return (
    <Button size="sm" onClick={handleInstall} disabled={loading}>
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackagePlus className="h-4 w-4" />}
      Instalar paquete
    </Button>
  );
}
