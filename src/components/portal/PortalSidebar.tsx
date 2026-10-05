"use client";

import Image from "next/image";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Users, Zap, BarChart3, Settings, MessageSquare, Calendar, FileText, LogOut, Bot, Upload, GitBranch, Rocket, UtensilsCrossed, CreditCard, X,
} from "lucide-react";
import { signOut } from "next-auth/react";
import type { PlatformModule } from "@prisma/client";
import { cn } from "@/lib/utils";
import { usePreferences } from "@/context/preferences";
import { LogoPickerDialog } from "@/components/shared/LogoPickerDialog";


interface NavItem {
  href: string;
  labelKey: keyof ReturnType<typeof useNavItems>;
  icon: React.ElementType;
}

function useNavItems() {
  const { t } = usePreferences();
  return {
    dashboard: t.dashboard,
    onboarding: t.onboarding,
    leads: t.leads,
    pipeline: t.pipeline,
    automations: t.automations,
    whatsapp: t.whatsapp,
    conversations: t.conversations,
    knowledgeBase: t.knowledgeBase,
    prompts: t.prompts,
    aiLab: t.aiLab,
    appointments: t.appointments,
    reports: t.reports,
    templates: t.templates,
    requests: t.requests,
    settings: t.settings,
    signOut: t.signOut,
    food: t.food,
    smartcard: t.smartcard,
  };
}

// `module: undefined` means the section isn't gated by any commercial module
// (always shown regardless of what the org has contracted). `alsoActiveFor`
// covers sibling routes folded into this item's own PortalSectionTabs (see
// src/lib/portal-nav-tabs.ts) — e.g. visiting /portal/prompts should still
// highlight the "WhatsApp AI" sidebar entry, not leave nothing active.
const NAV_ITEMS: { href: string; key: keyof ReturnType<typeof useNavItems>; icon: React.ElementType; module?: PlatformModule; alsoActiveFor?: string[] }[] = [
  { href: "/portal/dashboard", key: "dashboard", icon: LayoutDashboard },
  { href: "/portal/onboarding", key: "onboarding", icon: Rocket },
  { href: "/portal/leads", key: "leads", icon: Users, module: "CRM" },
  { href: "/portal/pipeline", key: "pipeline", icon: GitBranch, module: "CRM" },
  { href: "/portal/automations", key: "automations", icon: Zap, module: "AUTOMATIONS", alsoActiveFor: ["/portal/templates"] },
  { href: "/portal/whatsapp", key: "whatsapp", icon: Bot, module: "AI_WHATSAPP", alsoActiveFor: ["/portal/knowledge-base", "/portal/prompts", "/portal/ai-lab"] },
  { href: "/portal/conversations", key: "conversations", icon: MessageSquare, module: "AI_WHATSAPP" },
  { href: "/portal/appointments", key: "appointments", icon: Calendar },
  { href: "/portal/food", key: "food", icon: UtensilsCrossed, module: "FOOD_OPS" },
  { href: "/portal/reports", key: "reports", icon: BarChart3 },
  { href: "/portal/smartcard", key: "smartcard", icon: CreditCard, module: "NFC_QR" },
  { href: "/portal/requests", key: "requests", icon: FileText },
  { href: "/portal/settings", key: "settings", icon: Settings },
];

interface PortalSidebarProps {
  orgName: string;
  orgLogoUrl?: string | null;
  enabledModules: PlatformModule[];
  pendingConversations?: number;
  /** Off-canvas drawer state below `lg:` — controlled by PortalShell.tsx, which
   * also renders the hamburger toggle in TopBar. No effect at `lg:` and up,
   * where the sidebar is always visible exactly as before. */
  mobileOpen: boolean;
  onMobileClose: () => void;
}

export function PortalSidebar({ orgName, orgLogoUrl: initialLogoUrl, enabledModules, pendingConversations = 0, mobileOpen, onMobileClose }: PortalSidebarProps) {
  const pathname = usePathname();
  const { t, lang } = usePreferences();
  const labels = useNavItems();
  const visibleNavItems = NAV_ITEMS.filter((item) => !item.module || enabledModules.includes(item.module));

  const [logoDialogOpen, setLogoDialogOpen] = useState(false);
  const [currentLogoUrl, setCurrentLogoUrl] = useState(initialLogoUrl);



  return (
    <>
      {/*
        Same Reymen-brand treatment as AdminSidebar.tsx — light theme uses
        the brand navy gradient via plain utility classes; dark theme uses
        the shared `.dark .sidebar*` ruleset in globals.css (custom
        properties scoped to that selector, not the global color remap),
        via the same `sidebar*` hook classNames so both sidebars stay in
        sync from one CSS block instead of two.
      */}
      {/* Off-canvas backdrop — below `lg:` only, closes the drawer on click */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={onMobileClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={cn(
          "sidebar fixed inset-y-0 left-0 z-40 flex h-screen w-64 flex-col border-r border-brand-950 bg-gradient-to-b from-brand-900 to-brand-950 transition-transform duration-200 ease-in-out",
          "lg:static lg:z-auto lg:translate-x-0 lg:transition-none",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Logo / Org — clickable to update logo */}
        <div className="sidebar-header flex h-16 items-center border-b border-white/10 px-6 hover:bg-white/5 transition-colors">
          <button
            onClick={() => { setLogoDialogOpen(true); }}
            className="flex min-w-0 flex-1 items-center gap-2 text-left group"
          >
            <div className="relative flex-shrink-0">
              {currentLogoUrl ? (
                <img src={currentLogoUrl} alt={orgName} className="h-8 w-8 rounded-lg object-cover" />
              ) : (
                <Image src="/icons/icon-192.png" alt="ReymenApp" width={32} height={32} className="h-8 w-8 flex-shrink-0 rounded-lg" />
              )}
              <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
                <Upload className="h-3 w-3 text-white" />
              </div>
            </div>
            <div className="min-w-0">
              <p className="sidebar-name truncate text-sm font-bold text-white leading-none">{orgName}</p>
              <p className="sidebar-subtitle text-xs text-brand-200 leading-none mt-0.5">{t.brandName}</p>
            </div>
          </button>
          <button
            onClick={onMobileClose}
            className="ml-2 flex-shrink-0 rounded-md p-1.5 text-brand-100 hover:bg-white/10 hover:text-white transition-colors lg:hidden"
            aria-label={lang === "es" ? "Cerrar menú" : "Close menu"}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {visibleNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname.startsWith(item.href) || (item.alsoActiveFor?.some((p) => pathname.startsWith(p)) ?? false);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onMobileClose}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "sidebar-nav-active bg-white text-brand-700"
                    : "sidebar-nav-inactive text-brand-100 hover:bg-white/10 hover:text-white"
                )}
              >
                <Icon className="h-4 w-4 flex-shrink-0" />
                <span className="flex-1">{labels[item.key]}</span>
                {item.key === "conversations" && pendingConversations > 0 && (
                  <span className="flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-semibold text-white">
                    {pendingConversations > 99 ? "99+" : pendingConversations}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="sidebar-footer border-t border-white/10 p-3">
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="sidebar-nav-inactive flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-brand-100 hover:bg-white/10 hover:text-white transition-colors"
          >
            <LogOut className="h-4 w-4" />
            {t.signOut}
          </button>
        </div>
      </aside>

      <LogoPickerDialog
        key={logoDialogOpen ? "open" : "closed"}
        open={logoDialogOpen}
        onOpenChange={setLogoDialogOpen}
        currentLogoUrl={currentLogoUrl ?? null}
        onSaved={setCurrentLogoUrl}
      />
    </>
  );
}
