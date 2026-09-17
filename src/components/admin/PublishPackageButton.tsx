"use client";

import { useState } from "react";
import { Loader2, Globe, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { publishTemplatePackage } from "@/actions/admin/template-packages";

interface PublishPackageButtonProps {
  packageId: string;
  isPublished: boolean;
}

export function PublishPackageButton({ packageId, isPublished }: PublishPackageButtonProps) {
  const [loading, setLoading] = useState(false);
  const [published, setPublished] = useState(isPublished);

  async function handleToggle() {
    setLoading(true);
    try {
      await publishTemplatePackage(packageId, !published);
      setPublished(!published);
      toast.success(published ? "Paquete despublicado" : "Paquete publicado — visible para clientes");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      variant={published ? "outline" : "default"}
      size="sm"
      onClick={handleToggle}
      disabled={loading}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : published ? (
        <EyeOff className="h-4 w-4" />
      ) : (
        <Globe className="h-4 w-4" />
      )}
      {published ? "Despublicar" : "Publicar"}
    </Button>
  );
}
