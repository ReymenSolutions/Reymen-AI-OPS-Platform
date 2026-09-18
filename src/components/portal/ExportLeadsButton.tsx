"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePreferences } from "@/context/preferences";

export function ExportLeadsButton() {
  const { lang } = usePreferences();

  function handleExport() {
    window.location.href = "/api/portal/leads/export";
  }

  return (
    <Button variant="outline" size="sm" onClick={handleExport}>
      <Download className="h-4 w-4" />
      {lang === "es" ? "Exportar CSV" : "Export CSV"}
    </Button>
  );
}
