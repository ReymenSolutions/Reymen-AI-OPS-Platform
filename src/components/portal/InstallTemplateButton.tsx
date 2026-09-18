"use client";

import { useState } from "react";
import { Loader2, Download, CheckCircle2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { installTemplate, uninstallTemplate } from "@/actions/templates";
import { usePreferences } from "@/context/preferences";

interface InstallTemplateButtonProps {
  templateId: string;
  isInstalled: boolean;
}

export function InstallTemplateButton({ templateId, isInstalled: initialInstalled }: InstallTemplateButtonProps) {
  const { lang } = usePreferences();
  const [installed, setInstalled] = useState(initialInstalled);
  const [loading, setLoading] = useState(false);
  const [showUninstall, setShowUninstall] = useState(false);

  async function handleInstall() {
    setLoading(true);
    try {
      await installTemplate({ templateId });
      setInstalled(true);
      toast.success(lang === "es" ? "Template instalado. La automatización ya está activa." : "Template installed. The automation is now active.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : (lang === "es" ? "Error al instalar" : "Error installing"));
    } finally {
      setLoading(false);
    }
  }

  async function handleUninstall() {
    if (!confirm(lang === "es" ? "¿Desinstalar este template? La automatización asociada será archivada." : "Uninstall this template? The associated automation will be archived.")) return;
    setLoading(true);
    try {
      await uninstallTemplate(templateId);
      setInstalled(false);
      setShowUninstall(false);
      toast.success(lang === "es" ? "Template desinstalado" : "Template uninstalled");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : (lang === "es" ? "Error al desinstalar" : "Error uninstalling"));
    } finally {
      setLoading(false);
    }
  }

  if (installed) {
    return (
      <div
        className="relative"
        onMouseEnter={() => setShowUninstall(true)}
        onMouseLeave={() => setShowUninstall(false)}
      >
        {showUninstall ? (
          <Button
            variant="outline"
            size="sm"
            onClick={handleUninstall}
            disabled={loading}
            className="text-red-600 border-red-200 hover:bg-red-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            {lang === "es" ? "Desinstalar" : "Uninstall"}
          </Button>
        ) : (
          <Button variant="outline" size="sm" disabled className="text-emerald-600 border-emerald-200 bg-emerald-50">
            <CheckCircle2 className="h-4 w-4" />
            {lang === "es" ? "Instalado" : "Installed"}
          </Button>
        )}
      </div>
    );
  }

  return (
    <Button size="sm" onClick={handleInstall} disabled={loading}>
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
      {lang === "es" ? "Instalar" : "Install"}
    </Button>
  );
}
