"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export interface PortalTab {
  href: string;
  label: string;
}

// Same visual language as the AI Lab's own internal tab bar
// (AiLabWorkspace.tsx) — reused here for grouping sibling pages of a
// module family (e.g. WhatsApp AI, Automatizaciones) under one sidebar
// entry instead of listing each page as its own nav item.
export function PortalSectionTabs({ tabs }: { tabs: PortalTab[] }) {
  const pathname = usePathname();

  return (
    <div className="mb-6 flex gap-1 border-b border-slate-200">
      {tabs.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "border-b-2 px-4 py-2 text-sm font-medium transition-colors",
              active
                ? "border-brand-600 text-brand-700"
                : "border-transparent text-slate-500 hover:text-slate-700"
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
