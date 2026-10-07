"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createSmartcardThemeAction, updateSmartcardThemeAction } from "@/actions/admin/smartcard-settings";
import { LAYOUT_OPTIONS, BORDER_RADIUS_OPTIONS, FONT_OPTIONS, HEX_COLOR, type ThemeConfigFields } from "@/lib/smartcard-theme";

const HEX_COLOR_INPUT = /^#[0-9a-fA-F]{0,6}$/;

function ColorField({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (v: string) => void }) {
  const valid = HEX_COLOR.test(value);
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={valid ? value : "#000000"}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-9 shrink-0 cursor-pointer rounded-md border border-slate-200"
          aria-label={`${label} (selector)`}
        />
        <Input
          id={id}
          value={value}
          onChange={(e) => {
            const v = e.target.value;
            if (HEX_COLOR_INPUT.test(v)) onChange(v);
          }}
          placeholder="#111111"
          className="font-mono"
        />
      </div>
    </div>
  );
}

/**
 * Formulario compartido entre /admin/smartcard/settings/themes/new y
 * /admin/smartcard/settings/themes/[themeId] — mismos campos que
 * admin.reymen.mx's apps/admin/app/settings/themes/{new,[id]}/page.tsx:
 * layout/primary_color/accent_color/font/border_radius/dark_background
 * (whitelist completa en smartcard-theme.ts), más name/slug/is_active
 * (is_active solo al editar, igual que allá).
 */
export function SmartcardThemeForm({
  themeId,
  initialName,
  initialSlug,
  initialFields,
  initialIsActive,
}: {
  themeId?: string;
  initialName?: string;
  initialSlug?: string;
  initialFields?: ThemeConfigFields;
  initialIsActive?: boolean;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState(initialName ?? "");
  const [slug, setSlug] = useState(initialSlug ?? "");
  const [isActive, setIsActive] = useState(initialIsActive ?? true);
  const [fields, setFields] = useState<ThemeConfigFields>(
    initialFields ?? {
      layout: "minimal",
      primaryColor: "#111111",
      accentColor: "#4F46E5",
      font: "inter",
      borderRadius: "md",
      darkBackground: false,
    }
  );

  function set<K extends keyof ThemeConfigFields>(key: K, value: ThemeConfigFields[K]) {
    setFields((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit() {
    if (!name.trim() || !slug.trim()) {
      toast.error("El nombre y el slug son obligatorios.");
      return;
    }
    if (!HEX_COLOR.test(fields.primaryColor) || !HEX_COLOR.test(fields.accentColor)) {
      toast.error("Los colores deben tener el formato #RRGGBB.");
      return;
    }

    setSaving(true);
    const result = themeId
      ? await updateSmartcardThemeAction(themeId, { name, slug, fields, isActive })
      : await createSmartcardThemeAction({ name, slug, fields });
    setSaving(false);

    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success(themeId ? "Tema actualizado." : "Tema creado.");
    router.push(`/admin/smartcard/settings/themes/${themeId ?? result.data!.id}`);
    router.refresh();
  }

  return (
    <div className="flex max-w-lg flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="theme-name">
          Nombre <span className="text-red-600">*</span>
        </Label>
        <Input id="theme-name" value={name} onChange={(e) => setName(e.target.value)} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="theme-slug">
          Slug <span className="text-red-600">*</span>
        </Label>
        <Input id="theme-slug" value={slug} onChange={(e) => setSlug(e.target.value)} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="theme-layout">Layout</Label>
        <Select value={fields.layout} onValueChange={(v) => set("layout", v)}>
          <SelectTrigger id="theme-layout">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LAYOUT_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <ColorField id="theme-primary-color" label="Color primario" value={fields.primaryColor} onChange={(v) => set("primaryColor", v)} />
        <ColorField id="theme-accent-color" label="Color de acento" value={fields.accentColor} onChange={(v) => set("accentColor", v)} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="theme-font">Tipografía</Label>
        <Select value={fields.font} onValueChange={(v) => set("font", v)}>
          <SelectTrigger id="theme-font">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FONT_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="theme-border-radius">Bordes</Label>
        <Select value={fields.borderRadius} onValueChange={(v) => set("borderRadius", v)}>
          <SelectTrigger id="theme-border-radius">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {BORDER_RADIUS_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" className="h-3.5 w-3.5" checked={fields.darkBackground} onChange={(e) => set("darkBackground", e.target.checked)} />
        Fondo oscuro
      </label>

      {themeId && (
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" className="h-3.5 w-3.5" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
          Activo
        </label>
      )}

      <div className="flex gap-2">
        <Button onClick={handleSubmit} disabled={saving || !name.trim() || !slug.trim()}>
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          Guardar tema
        </Button>
        <Button variant="outline" onClick={() => router.back()} disabled={saving}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}
