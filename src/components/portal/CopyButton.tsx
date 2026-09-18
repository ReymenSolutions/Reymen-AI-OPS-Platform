"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { usePreferences } from "@/context/preferences";

export function CopyButton({ text }: { text: string }) {
  const { lang } = usePreferences();
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      onClick={handleCopy}
      className="flex-shrink-0 rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-600 transition-colors"
      title={lang === "es" ? "Copiar" : "Copy"}
    >
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}
