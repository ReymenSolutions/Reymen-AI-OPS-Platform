"use client";

import { useState } from "react";
import { Loader2, QrCode } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { getSmartcardAdminCardQrCodeAction } from "@/actions/admin/smartcard-cards";

/**
 * Descarga el PNG del QR de una tarjeta — mismo mecanismo que el botón
 * equivalente en el portal de autoservicio (SmartcardPanel.tsx): genera un
 * data URL en el servidor y dispara la descarga en el navegador con un
 * <a download> temporal, sin un endpoint de archivo aparte.
 */
export function SmartcardCardQrButton({ cardId, cardCode }: { cardId: string; cardCode: string }) {
  const [loading, setLoading] = useState(false);

  async function handleDownload() {
    setLoading(true);
    try {
      const result = await getSmartcardAdminCardQrCodeAction(cardId);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      const link = document.createElement("a");
      link.href = result.dataUrl;
      link.download = `${cardCode}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch {
      toast.error("No se pudo generar el QR.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={handleDownload} disabled={loading}>
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <QrCode className="h-3.5 w-3.5" />}
      Descargar QR
    </Button>
  );
}
