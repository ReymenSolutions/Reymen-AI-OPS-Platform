"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { usePreferences } from "@/context/preferences";

// Botón de copiar compartido. Antes existía uno en portal/ que nadie usaba
// y cada diálogo de admin (AutomationsManager, OrgWebhookInfoDialog) traía
// su propia copia del botón y del hook.

/** true durante 2 s después de copiar, para mostrar la palomita. */
export function useCopyToClipboard() {
  const [copied, setCopied] = useState(false);
  function copy(text: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }
  return { copied, copy };
}

export function CopyButton({ text, label }: { text: string; label?: string }) {
  const { lang } = usePreferences();
  const { copied, copy } = useCopyToClipboard();
  return (
    <button
      type="button"
      onClick={() => copy(text)}
      className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-brand-600 transition-colors"
      title={lang === "es" ? "Copiar" : "Copy"}
    >
      {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
      {label && <span>{copied ? "✓" : label}</span>}
    </button>
  );
}
