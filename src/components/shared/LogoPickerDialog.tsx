"use client";

import { useRef, useState, useTransition } from "react";
import { Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { usePreferences } from "@/context/preferences";
import { updateOrgLogo } from "@/actions/profile";
import { readImageFileAsSquareDataUrl, squareImageErrorMessage } from "@/lib/square-image";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Diálogo para elegir el logo (imagen predefinida, archivo o URL). Antes
// estaba copiado completo en AdminSidebar y PortalSidebar, y la copia del
// portal tenía un error: "Quitar logo" guardaba el logo anterior en vez de
// quitarlo.

export const LOGO_PRESETS = [
  // Shapes
  "https://api.dicebear.com/9.x/shapes/svg?seed=alpha",
  "https://api.dicebear.com/9.x/shapes/svg?seed=beta",
  "https://api.dicebear.com/9.x/shapes/svg?seed=gamma",
  "https://api.dicebear.com/9.x/shapes/svg?seed=delta",
  // Identicon
  "https://api.dicebear.com/9.x/identicon/svg?seed=epsilon",
  "https://api.dicebear.com/9.x/identicon/svg?seed=zeta",
  "https://api.dicebear.com/9.x/identicon/svg?seed=eta",
  "https://api.dicebear.com/9.x/identicon/svg?seed=theta",
  // Icons
  "https://api.dicebear.com/9.x/icons/svg?seed=iota",
  "https://api.dicebear.com/9.x/icons/svg?seed=kappa",
  "https://api.dicebear.com/9.x/icons/svg?seed=lambda",
  "https://api.dicebear.com/9.x/icons/svg?seed=mu",
  // Rings
  "https://api.dicebear.com/9.x/rings/svg?seed=nu",
  "https://api.dicebear.com/9.x/rings/svg?seed=xi",
  "https://api.dicebear.com/9.x/rings/svg?seed=omicron",
  "https://api.dicebear.com/9.x/rings/svg?seed=pi",
  // Bottts Neutral
  "https://api.dicebear.com/9.x/bottts-neutral/svg?seed=rho",
  "https://api.dicebear.com/9.x/bottts-neutral/svg?seed=sigma",
  "https://api.dicebear.com/9.x/bottts-neutral/svg?seed=tau",
  "https://api.dicebear.com/9.x/bottts-neutral/svg?seed=upsilon",
  // Pixel Art Neutral
  "https://api.dicebear.com/9.x/pixel-art-neutral/svg?seed=phi",
  "https://api.dicebear.com/9.x/pixel-art-neutral/svg?seed=chi",
  "https://api.dicebear.com/9.x/pixel-art-neutral/svg?seed=psi",
  "https://api.dicebear.com/9.x/pixel-art-neutral/svg?seed=omega",
];


interface LogoPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Logo guardado actualmente, o null. */
  currentLogoUrl: string | null;
  /** Se llama después de guardar o quitar el logo con éxito. */
  onSaved: (logoUrl: string | null) => void;
}

export function LogoPickerDialog({ open, onOpenChange, currentLogoUrl, onSaved }: LogoPickerDialogProps) {
  const { t, lang } = usePreferences();
  const [logoUrl, setLogoUrl] = useState(currentLogoUrl ?? "");
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      setLogoUrl(await readImageFileAsSquareDataUrl(file));
    } catch (error) {
      toast.error(squareImageErrorMessage(error, lang));
    }
  }

  function save(next: string | null) {
    startTransition(async () => {
      try {
        await updateOrgLogo(next);
        setLogoUrl(next ?? "");
        onSaved(next);
        onOpenChange(false);
        toast.success(t.success);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : t.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onOpenChange(false)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-brand-600" />
            {t.orgLogoTitle}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {/* Preview */}
          {logoUrl && (
            <div className="flex justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logoUrl} alt="" className="h-20 w-20 rounded-xl object-cover ring-4 ring-brand-100" />
            </div>
          )}

          {/* Presets */}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              {lang === "es" ? "Avatares predefinidos" : "Preset avatars"}
            </p>
            <div className="max-h-64 overflow-y-auto pr-0.5">
              <div className="grid grid-cols-4 gap-2">
                {LOGO_PRESETS.map((url) => (
                  <button
                    key={url}
                    type="button"
                    onClick={() => setLogoUrl(url)}
                    className={cn(
                      "overflow-hidden rounded-lg border-2 transition-all",
                      logoUrl === url ? "border-brand-600 scale-105" : "border-transparent hover:border-brand-300"
                    )}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt="" className="h-14 w-14 object-cover" />
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* File upload */}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              {lang === "es" ? "O sube desde tu dispositivo" : "Or upload from your device"}
            </p>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
            <Button type="button" variant="outline" className="w-full" onClick={() => fileInputRef.current?.click()}>
              <Upload className="h-4 w-4 mr-2" />
              {lang === "es" ? "Elegir imagen" : "Choose image"}
            </Button>
          </div>

          {/* Manual URL */}
          <div className="space-y-1.5">
            <Label htmlFor="logo-picker-url">{t.logoUrl}</Label>
            <Input
              id="logo-picker-url"
              type="url"
              placeholder="https://..."
              value={logoUrl.startsWith("data:") ? "" : logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t.cancel}</Button>
          {currentLogoUrl && (
            <Button
              variant="outline"
              className="text-red-600 border-red-200 hover:bg-red-50"
              disabled={isPending}
              onClick={() => save(null)}
            >
              {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              {t.removeLogo}
            </Button>
          )}
          <Button onClick={() => save(logoUrl || null)} disabled={isPending || !logoUrl}>
            {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
            {t.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
