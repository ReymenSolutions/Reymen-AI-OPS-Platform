"use client";

import { useState, useTransition } from "react";
import { Trash2, Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { usePreferences } from "@/context/preferences";
import { createService, updateService, deleteService } from "@/actions/services";
import { formatCurrency } from "@/lib/utils";

interface ServiceRow {
  id: string;
  name: string;
  durationMinutes: number;
  bufferMinutes: number;
  price: number | null;
  isActive: boolean;
  appointmentCount: number;
}

export function ServicesManager({ services }: { services: ServiceRow[] }) {
  const { lang } = usePreferences();
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [duration, setDuration] = useState("30");
  const [buffer, setBuffer] = useState("0");
  const [price, setPrice] = useState("");

  function handleCreate() {
    const durationMinutes = Number(duration);
    if (!name.trim() || !durationMinutes) return;
    startTransition(async () => {
      try {
        await createService({
          name: name.trim(),
          durationMinutes,
          bufferMinutes: Number(buffer) || 0,
          price: price ? Number(price) : undefined,
        });
        setName(""); setDuration("30"); setBuffer("0"); setPrice("");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : (lang === "es" ? "Error al crear el servicio" : "Error creating service"));
      }
    });
  }

  function handleToggleActive(id: string, isActive: boolean) {
    startTransition(async () => {
      try {
        await updateService({ serviceId: id, isActive });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : (lang === "es" ? "Error al actualizar" : "Error updating"));
      }
    });
  }

  function handleDelete(id: string, appointmentCount: number) {
    if (appointmentCount > 0) {
      toast.error(lang === "es" ? "No se puede eliminar un servicio con citas asociadas. Desactívalo." : "Cannot delete a service with appointments. Deactivate it instead.");
      return;
    }
    if (!confirm(lang === "es" ? "¿Eliminar este servicio?" : "Delete this service?")) return;
    startTransition(async () => {
      try {
        await deleteService(id);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : (lang === "es" ? "Error al eliminar" : "Error deleting"));
      }
    });
  }

  return (
    <div className="space-y-2">
      {services.map((s) => (
        <div key={s.id} className="flex items-center gap-2 rounded-md border border-slate-100 p-2.5 text-sm">
          <div className="flex-1 min-w-0">
            <p className={`font-medium ${s.isActive ? "text-slate-900" : "text-slate-400 line-through"}`}>{s.name}</p>
            <p className="text-xs text-slate-400">
              {s.durationMinutes} min
              {s.bufferMinutes > 0 && ` · +${s.bufferMinutes} min ${lang === "es" ? "buffer" : "buffer"}`}
              {s.price != null && ` · ${formatCurrency(s.price)}`}
            </p>
          </div>
          {!s.isActive && <Badge variant="secondary">{lang === "es" ? "Inactivo" : "Inactive"}</Badge>}
          <button
            onClick={() => handleToggleActive(s.id, !s.isActive)}
            disabled={isPending}
            className="rounded px-2 py-1 text-xs text-slate-500 hover:bg-slate-50"
          >
            {s.isActive ? (lang === "es" ? "Desactivar" : "Deactivate") : (lang === "es" ? "Activar" : "Activate")}
          </button>
          <button
            onClick={() => handleDelete(s.id, s.appointmentCount)}
            disabled={isPending}
            className="rounded p-1 text-slate-300 hover:bg-red-50 hover:text-red-500"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}

      <div className="grid grid-cols-4 gap-1.5 pt-1">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={lang === "es" ? "Nombre" : "Name"} className="col-span-2 h-8 text-sm" />
        <Input value={duration} onChange={(e) => setDuration(e.target.value)} type="number" min="5" placeholder={lang === "es" ? "Min." : "Min."} className="h-8 text-sm" />
        <Input value={buffer} onChange={(e) => setBuffer(e.target.value)} type="number" min="0" placeholder={lang === "es" ? "Buffer" : "Buffer"} className="h-8 text-sm" />
      </div>
      <div className="flex gap-1.5">
        <Input value={price} onChange={(e) => setPrice(e.target.value)} type="number" min="0" placeholder={lang === "es" ? "Precio (opcional)" : "Price (optional)"} className="h-8 flex-1 text-sm" />
        <Button size="sm" variant="outline" onClick={handleCreate} disabled={isPending || !name.trim() || !Number(duration)}>
          {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
        </Button>
      </div>
    </div>
  );
}
