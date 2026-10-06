"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createSmartcardProfileAction, updateSmartcardProfileAction } from "@/actions/admin/smartcard-profiles";
import type { SmartcardAdminProfileInput, SmartcardClientOption, SmartcardThemeOption } from "@/lib/smartcard-admin";

const NO_THEME = "__none__";
const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * Formulario compartido entre /admin/smartcard/profiles/new y
 * /admin/smartcard/profiles/[profileId] — mismos campos que admin.reymen.mx
 * (apps/admin/app/profiles/{new,[id]}/page.tsx): a diferencia del editor de
 * autoservicio (SmartcardProfileDialog.tsx, solo contacto + tema básico),
 * este expone también slug, el catálogo completo de temas (theme_id),
 * estado y noindex — es el panel de REYMEN, no el del cliente.
 *
 * photo_url/logo_url siguen siendo campos de solo pegar una URL — la subida
 * de archivo a Storage (media-actions.ts en admin.reymen.mx) es trabajo
 * aparte, no incluido en esta migración.
 *
 * El cliente solo se elige al crear (igual que admin.reymen.mx — su
 * [id]/page.tsx tampoco deja mover un perfil de cliente después). Si
 * lockedClientId viene de la URL (?clientId=, desde el detalle del cliente)
 * el selector no se muestra; si no, se pide explícitamente.
 */
export function SmartcardProfileForm({
  profileId,
  initial,
  themes,
  clients,
  lockedClientId,
}: {
  profileId?: string;
  initial?: SmartcardAdminProfileInput;
  themes: SmartcardThemeOption[];
  /** Solo para /new. */
  clients?: SmartcardClientOption[];
  lockedClientId?: string;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState(lockedClientId ?? "");
  const [form, setForm] = useState<SmartcardAdminProfileInput>(
    initial ?? {
      slug: "",
      displayName: "",
      firstName: "",
      lastName: "",
      jobTitle: "",
      company: "",
      bio: "",
      photoUrl: "",
      logoUrl: "",
      phone: "",
      whatsapp: "",
      email: "",
      website: "",
      address: "",
      mapsUrl: "",
      instagram: "",
      facebook: "",
      linkedin: "",
      tiktok: "",
      youtube: "",
      themeId: null,
      status: "ACTIVE",
      isNoindex: false,
    }
  );

  function set<K extends keyof SmartcardAdminProfileInput>(key: K, value: SmartcardAdminProfileInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit() {
    const slug = form.slug.trim().toLowerCase();
    if (!slug || !SLUG_PATTERN.test(slug)) {
      toast.error('El slug debe usar solo minúsculas, números y guiones simples (ej. "juan-perez").');
      return;
    }
    if (!form.displayName.trim()) {
      toast.error("El nombre a mostrar es obligatorio.");
      return;
    }
    if (!profileId && !selectedClientId) {
      toast.error("El cliente es obligatorio.");
      return;
    }

    setSaving(true);
    const payload = { ...form, slug };
    const result = profileId
      ? await updateSmartcardProfileAction(profileId, payload)
      : await createSmartcardProfileAction(selectedClientId, payload);
    setSaving(false);

    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success(profileId ? "Perfil actualizado." : "Perfil creado.");
    router.push(`/admin/smartcard/profiles/${profileId ?? result.data!.id}`);
    router.refresh();
  }

  return (
    <div className="flex max-w-xl flex-col gap-4">
      {!profileId && !lockedClientId && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="profile-client">
            Cliente <span className="text-red-600">*</span>
          </Label>
          <Select value={selectedClientId} onValueChange={setSelectedClientId}>
            <SelectTrigger id="profile-client">
              <SelectValue placeholder="Selecciona un cliente..." />
            </SelectTrigger>
            <SelectContent>
              {(clients ?? []).map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="profile-slug">
          Slug <span className="text-red-600">*</span>
        </Label>
        <Input id="profile-slug" value={form.slug} onChange={(e) => set("slug", e.target.value)} placeholder="juan-perez" />
        <p className="text-xs text-slate-500">
          Así se verá la URL pública: link.reymensolutions.mx/{form.slug || "[slug]"}. Solo minúsculas, números y guiones.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="profile-display-name">
          Nombre a mostrar <span className="text-red-600">*</span>
        </Label>
        <Input id="profile-display-name" value={form.displayName} onChange={(e) => set("displayName", e.target.value)} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="profile-first-name">Nombre(s)</Label>
          <Input id="profile-first-name" value={form.firstName ?? ""} onChange={(e) => set("firstName", e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="profile-last-name">Apellido(s)</Label>
          <Input id="profile-last-name" value={form.lastName ?? ""} onChange={(e) => set("lastName", e.target.value)} />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="profile-job-title">Puesto</Label>
        <Input id="profile-job-title" value={form.jobTitle ?? ""} onChange={(e) => set("jobTitle", e.target.value)} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="profile-company">Empresa</Label>
        <Input id="profile-company" value={form.company ?? ""} onChange={(e) => set("company", e.target.value)} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="profile-bio">Bio</Label>
        <Textarea id="profile-bio" rows={2} value={form.bio ?? ""} onChange={(e) => set("bio", e.target.value)} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="profile-photo-url">URL de foto</Label>
          <Input id="profile-photo-url" value={form.photoUrl ?? ""} onChange={(e) => set("photoUrl", e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="profile-logo-url">URL de logo</Label>
          <Input id="profile-logo-url" value={form.logoUrl ?? ""} onChange={(e) => set("logoUrl", e.target.value)} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="profile-phone">Teléfono</Label>
          <Input id="profile-phone" type="tel" value={form.phone ?? ""} onChange={(e) => set("phone", e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="profile-whatsapp">WhatsApp</Label>
          <Input id="profile-whatsapp" type="tel" value={form.whatsapp ?? ""} onChange={(e) => set("whatsapp", e.target.value)} />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="profile-email">Correo</Label>
        <Input id="profile-email" type="email" value={form.email ?? ""} onChange={(e) => set("email", e.target.value)} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="profile-website">Sitio web</Label>
        <Input id="profile-website" type="url" placeholder="https://..." value={form.website ?? ""} onChange={(e) => set("website", e.target.value)} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="profile-address">Dirección</Label>
        <Input id="profile-address" value={form.address ?? ""} onChange={(e) => set("address", e.target.value)} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="profile-maps-url">URL de Google Maps</Label>
        <Input id="profile-maps-url" type="url" value={form.mapsUrl ?? ""} onChange={(e) => set("mapsUrl", e.target.value)} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="profile-instagram">Instagram</Label>
          <Input id="profile-instagram" type="url" value={form.instagram ?? ""} onChange={(e) => set("instagram", e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="profile-facebook">Facebook</Label>
          <Input id="profile-facebook" type="url" value={form.facebook ?? ""} onChange={(e) => set("facebook", e.target.value)} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="profile-linkedin">LinkedIn</Label>
          <Input id="profile-linkedin" type="url" value={form.linkedin ?? ""} onChange={(e) => set("linkedin", e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="profile-tiktok">TikTok</Label>
          <Input id="profile-tiktok" type="url" value={form.tiktok ?? ""} onChange={(e) => set("tiktok", e.target.value)} />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="profile-youtube">YouTube</Label>
        <Input id="profile-youtube" type="url" value={form.youtube ?? ""} onChange={(e) => set("youtube", e.target.value)} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="profile-theme">Tema visual</Label>
        <Select value={form.themeId ?? NO_THEME} onValueChange={(v) => set("themeId", v === NO_THEME ? null : v)}>
          <SelectTrigger id="profile-theme">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_THEME}>Sin tema (usa el default)</SelectItem>
            {themes.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="profile-status">Estado</Label>
        <Select value={form.status} onValueChange={(v) => set("status", v as "ACTIVE" | "INACTIVE")}>
          <SelectTrigger id="profile-status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ACTIVE">Activo</SelectItem>
            <SelectItem value="INACTIVE">Inactivo</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          className="h-3.5 w-3.5"
          checked={form.isNoindex}
          onChange={(e) => set("isNoindex", e.target.checked)}
        />
        No indexar en buscadores (noindex)
      </label>

      <div className="flex gap-2">
        <Button
          onClick={handleSubmit}
          disabled={saving || !form.slug.trim() || !form.displayName.trim() || (!profileId && !selectedClientId)}
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          Guardar perfil
        </Button>
        <Button variant="outline" onClick={() => router.back()} disabled={saving}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}
