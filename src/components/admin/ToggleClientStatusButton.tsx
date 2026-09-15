"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Ban, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { updateClientStatus } from "@/actions/admin/clients";
import { usePreferences } from "@/context/preferences";

interface ToggleClientStatusButtonProps {
  orgId: string;
  isActive: boolean;
}

export function ToggleClientStatusButton({ orgId, isActive: initialActive }: ToggleClientStatusButtonProps) {
  const { t } = usePreferences();
  const router = useRouter();
  const [isActive, setIsActive] = useState(initialActive);
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    if (isActive && !confirm(t.adminSuspendClientConfirm)) return;
    setLoading(true);
    try {
      await updateClientStatus(orgId, !isActive);
      setIsActive(!isActive);
      toast.success(isActive ? t.adminClientSuspended : t.adminClientReactivated);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t.error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleClick}
      disabled={loading}
      className={isActive ? "text-red-600 border-red-200 hover:bg-red-50" : "text-emerald-600 border-emerald-200 hover:bg-emerald-50"}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : isActive ? (
        <Ban className="h-4 w-4" />
      ) : (
        <RotateCcw className="h-4 w-4" />
      )}
      {isActive ? t.adminSuspendClient : t.adminReactivateClient}
    </Button>
  );
}
