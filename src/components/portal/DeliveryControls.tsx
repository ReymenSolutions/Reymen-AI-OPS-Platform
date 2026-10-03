"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import type { DeliveryOrderStatus, DeliveryPlatform } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { clearDeliveryTestOrders, createDeliveryTestOrder, saveDeliveryChannel, setDeliveryOrderStatus } from "@/actions/delivery";
import { usePreferences } from "@/context/preferences";
import { deliveryStrings } from "@/lib/i18n-delivery";
import { pickDict } from "@/lib/i18n-dict";
import { getErrorMessage } from "@/lib/user-error";
import { cn } from "@/lib/utils";

function useAction() {
  const { lang } = usePreferences();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<unknown>, ok?: string) =>
    start(async () => {
      try {
        await fn();
        if (ok) toast.success(ok);
      } catch (e) {
        toast.error(getErrorMessage(e, lang === "en" ? "Couldn't save" : "No se pudo guardar"));
      }
    });
  return { pending, run };
}

/** Conectar / desconectar una plataforma, su ID de tienda y el pedido de prueba. */
export function DeliveryChannelControls({ platform, enabled, storeId }: { platform: DeliveryPlatform; enabled: boolean; storeId: string | null }) {
  const { lang } = usePreferences();
  const t = pickDict(deliveryStrings, lang);
  const { pending, run } = useAction();
  const [store, setStore] = useState(storeId ?? "");
  return (
    <div className="space-y-2">
      <label className="block space-y-1">
        <span className="text-xs font-medium text-slate-600">{t.storeId}</span>
        <input
          value={store}
          maxLength={120}
          onChange={(e) => setStore(e.target.value)}
          className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-brand-500"
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant={enabled ? "outline" : "default"}
          disabled={pending}
          onClick={() => run(() => saveDeliveryChannel({ platform, enabled: !enabled, storeId: store }), t.saved)}
        >
          {enabled ? t.disconnect : t.connect}
        </Button>
        {enabled && store !== (storeId ?? "") && (
          <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => saveDeliveryChannel({ platform, enabled, storeId: store }), t.saved)}>
            {t.save}
          </Button>
        )}
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => createDeliveryTestOrder(platform), t.testCreated)}>
          {t.testOrder}
        </Button>
      </div>
    </div>
  );
}

export function DeliveryClearTests() {
  const { lang } = usePreferences();
  const t = pickDict(deliveryStrings, lang);
  const { pending, run } = useAction();
  return (
    <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => clearDeliveryTestOrders())}>
      {t.clearTests}
    </Button>
  );
}

/** Botón con el siguiente paso del pedido y cancelar. */
export function DeliveryOrderActions({ orderId, status, next }: { orderId: string; status: DeliveryOrderStatus; next: DeliveryOrderStatus | null }) {
  const { lang } = usePreferences();
  const t = pickDict(deliveryStrings, lang);
  const { pending, run } = useAction();
  const label = (t as Record<string, unknown>)[`next${status}`];
  return (
    <div className="flex gap-1.5">
      {next && typeof label === "string" && (
        <Button size="sm" className={cn("flex-1")} disabled={pending} onClick={() => run(() => setDeliveryOrderStatus(orderId, next))}>
          {label}
        </Button>
      )}
      <Button
        size="sm"
        variant="ghost"
        className="text-red-600 hover:bg-red-50"
        disabled={pending}
        onClick={() => {
          if (confirm(t.cancelConfirm)) run(() => setDeliveryOrderStatus(orderId, "CANCELLED"));
        }}
      >
        {t.cancel}
      </Button>
    </div>
  );
}
