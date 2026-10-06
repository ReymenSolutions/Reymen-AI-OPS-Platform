"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import {
  addSmartcardProfileLinkAction,
  deleteSmartcardProfileLinkAction,
  toggleSmartcardProfileLinkAction,
  moveSmartcardProfileLinkAction,
  updateSmartcardProfileLinkIconAction,
} from "@/actions/admin/smartcard-profiles";
import { LINK_ICON_OPTIONS } from "@/lib/smartcard-link-icons";
import type { SmartcardAdminProfileLink } from "@/lib/smartcard-admin";

// Radix's <Select.Item> rejects value="" (reserved for "no selection"), pero
// LINK_ICON_OPTIONS usa "" para el ícono genérico (igual que
// admin.reymen.mx) — se mapea a este sentinel solo para el <Select>, nunca
// para lo que se guarda (ver toIconValue/fromIconValue).
const GENERIC_ICON = "__generic__";
const toIconValue = (icon: string) => icon || GENERIC_ICON;
const fromIconValue = (value: string) => (value === GENERIC_ICON ? "" : value);

/**
 * Gestión de los botones/links del perfil público — mismo set de acciones
 * que admin.reymen.mx's apps/admin/app/profiles/[id]/page.tsx (agregar,
 * eliminar, activar/desactivar, subir/bajar, cambiar ícono), reescrito como
 * un solo panel de cliente en vez de un <form> nativo por fila.
 */
export function SmartcardProfileLinksPanel({
  profileId,
  initialLinks,
}: {
  profileId: string;
  initialLinks: SmartcardAdminProfileLink[];
}) {
  const [links, setLinks] = useState(initialLinks);
  const [pending, startTransition] = useTransition();
  const [busyLinkId, setBusyLinkId] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [icon, setIcon] = useState("");

  function handleAdd() {
    if (!title.trim() || !url.trim()) {
      toast.error("El título y la URL del link son obligatorios.");
      return;
    }
    startTransition(async () => {
      const result = await addSmartcardProfileLinkAction(profileId, { title, url, icon: icon || null });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setLinks((prev) => [
        ...prev,
        { id: result.data.id, title: title.trim(), url: url.trim(), icon: icon || null, isActive: true, sortOrder: prev.length },
      ]);
      setTitle("");
      setUrl("");
      setIcon("");
      toast.success("Link agregado.");
    });
  }

  function handleDelete(linkId: string) {
    setBusyLinkId(linkId);
    startTransition(async () => {
      const result = await deleteSmartcardProfileLinkAction(profileId, linkId);
      setBusyLinkId(null);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setLinks((prev) => prev.filter((l) => l.id !== linkId));
    });
  }

  function handleToggle(link: SmartcardAdminProfileLink) {
    setBusyLinkId(link.id);
    startTransition(async () => {
      const result = await toggleSmartcardProfileLinkAction(profileId, link.id, !link.isActive);
      setBusyLinkId(null);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setLinks((prev) => prev.map((l) => (l.id === link.id ? { ...l, isActive: !l.isActive } : l)));
    });
  }

  function handleMove(linkId: string, direction: "up" | "down") {
    const index = links.findIndex((l) => l.id === linkId);
    const swapIndex = direction === "up" ? index - 1 : index + 1;
    if (index === -1 || swapIndex < 0 || swapIndex >= links.length) return;

    setBusyLinkId(linkId);
    startTransition(async () => {
      const result = await moveSmartcardProfileLinkAction(profileId, linkId, direction);
      setBusyLinkId(null);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setLinks((prev) => {
        const next = [...prev];
        [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
        return next;
      });
    });
  }

  function handleIconChange(linkId: string, newIcon: string) {
    setLinks((prev) => prev.map((l) => (l.id === linkId ? { ...l, icon: newIcon || null } : l)));
    startTransition(async () => {
      const result = await updateSmartcardProfileLinkIconAction(profileId, linkId, newIcon || null);
      if (!result.success) toast.error(result.error);
    });
  }

  return (
    <div>
      <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Links del perfil público ({links.length})</h2>

      {links.length === 0 && <p className="text-sm text-slate-400">Sin links todavía.</p>}

      {links.length > 0 && (
        <Card>
          <CardContent className="flex flex-col divide-y divide-slate-100 p-0">
            {links.map((link, index) => (
              <div key={link.id} className="flex flex-col gap-2 px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className={`truncate text-sm font-medium ${!link.isActive ? "text-slate-400" : "text-slate-900"}`}>{link.title}</p>
                    <p className="truncate text-xs text-slate-400">{link.url}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      disabled={pending || busyLinkId === link.id || index === 0}
                      onClick={() => handleMove(link.id, "up")}
                      aria-label="Subir"
                      className="text-slate-500 hover:text-slate-900 disabled:opacity-30"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      disabled={pending || busyLinkId === link.id || index === links.length - 1}
                      onClick={() => handleMove(link.id, "down")}
                      aria-label="Bajar"
                      className="text-slate-500 hover:text-slate-900 disabled:opacity-30"
                    >
                      ↓
                    </button>
                    <Button variant="ghost" size="sm" disabled={pending || busyLinkId === link.id} onClick={() => handleToggle(link)}>
                      {link.isActive ? "Desactivar" : "Activar"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-600 hover:text-red-700"
                      disabled={pending || busyLinkId === link.id}
                      onClick={() => handleDelete(link.id)}
                    >
                      Eliminar
                    </Button>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Label htmlFor={`icon-${link.id}`} className="text-xs text-slate-500">
                    Ícono
                  </Label>
                  <Select value={toIconValue(link.icon ?? "")} onValueChange={(v) => handleIconChange(link.id, fromIconValue(v))}>
                    <SelectTrigger id={`icon-${link.id}`} className="h-7 w-48 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LINK_ICON_OPTIONS.map((o) => (
                        <SelectItem key={toIconValue(o.value)} value={toIconValue(o.value)}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="mt-4 flex flex-wrap items-end gap-2">
        <div className="flex flex-1 flex-col gap-1">
          <Label htmlFor="link-title" className="text-xs font-medium text-slate-500">
            Título
          </Label>
          <Input id="link-title" placeholder="Ver propiedades" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="flex flex-[2] flex-col gap-1">
          <Label htmlFor="link-url" className="text-xs font-medium text-slate-500">
            URL
          </Label>
          <Input id="link-url" type="url" placeholder="https://..." value={url} onChange={(e) => setUrl(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="link-icon" className="text-xs font-medium text-slate-500">
            Ícono
          </Label>
          <Select value={toIconValue(icon)} onValueChange={(v) => setIcon(fromIconValue(v))}>
            <SelectTrigger id="link-icon" className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LINK_ICON_OPTIONS.map((o) => (
                <SelectItem key={toIconValue(o.value)} value={toIconValue(o.value)}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" disabled={pending} onClick={handleAdd}>
          + Agregar link
        </Button>
      </div>
    </div>
  );
}
