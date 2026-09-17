"use client";

import { useState, useTransition, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Users, Zap, BarChart3, Settings, MessageSquare,
  Calendar, FileText, LogOut, BookOpen, Bot, SlidersHorizontal,
  Layers, Upload, Loader2, GitBranch, FlaskConical, Rocket,
} from "lucide-react";
import { signOut } from "next-auth/react";
import type { PlatformModule } from "@prisma/client";
import { cn } from "@/lib/utils";
import { usePreferences } from "@/context/preferences";
import { updateOrgLogo } from "@/actions/profile";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const LOGO_PRESETS = [
  // Shapes
  "https://api.dicebear.com/9.x/shapes/svg?seed=alpha",
  "https://api.dicebear.com/9.x/shapes/svg?seed=beta",
  "https://api.dicebear.com/9.x/shapes/svg?seed=gamma",
  "https://api.dicebear.com/9.x/shapes/svg?seed=delta",
  // Identicon
  "https://api.dicebear.com/9.x/identicon/svg?seed=epsilon",
  "https://api.dicebear.com/9.x/identicon/svg?seed=zeta",
  "https://api.dicebear.com/9.x/identicon/svg?seed=eta",
  "https://api.dicebear.com/9.x/identicon/svg?seed=theta",
  // Icons
  "https://api.dicebear.com/9.x/icons/svg?seed=iota",
  "https://api.dicebear.com/9.x/icons/svg?seed=kappa",
  "https://api.dicebear.com/9.x/icons/svg?seed=lambda",
  "https://api.dicebear.com/9.x/icons/svg?seed=mu",
  // Rings
  "https://api.dicebear.com/9.x/rings/svg?seed=nu",
  "https://api.dicebear.com/9.x/rings/svg?seed=xi",
  "https://api.dicebear.com/9.x/rings/svg?seed=omicron",
  "https://api.dicebear.com/9.x/rings/svg?seed=pi",
  // Bottts Neutral
  "https://api.dicebear.com/9.x/bottts-neutral/svg?seed=rho",
  "https://api.dicebear.com/9.x/bottts-neutral/svg?seed=sigma",
  "https://api.dicebear.com/9.x/bottts-neutral/svg?seed=tau",
  "https://api.dicebear.com/9.x/bottts-neutral/svg?seed=upsilon",
  // Pixel Art Neutral
  "https://api.dicebear.com/9.x/pixel-art-neutral/svg?seed=phi",
  "https://api.dicebear.com/9.x/pixel-art-neutral/svg?seed=chi",
  "https://api.dicebear.com/9.x/pixel-art-neutral/svg?seed=psi",
  "https://api.dicebear.com/9.x/pixel-art-neutral/svg?seed=omega",
];

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
  };
}

// `module: undefined` means the section isn't gated by any commercial module
// (always shown regardless of what the org has contracted).
const NAV_ITEMS: { href: string; key: keyof ReturnType<typeof useNavItems>; icon: React.ElementType; module?: PlatformModule }[] = [
  { href: "/portal/dashboard", key: "dashboard", icon: LayoutDashboard },
  { href: "/portal/onboarding", key: "onboarding", icon: Rocket },
  { href: "/portal/leads", key: "leads", icon: Users, module: "CRM" },
  { href: "/portal/pipeline", key: "pipeline", icon: GitBranch, module: "CRM" },
  { href: "/portal/automations", key: "automations", icon: Zap, module: "AUTOMATIONS" },
  { href: "/portal/whatsapp", key: "whatsapp", icon: Bot, module: "AI_WHATSAPP" },
  { href: "/portal/conversations", key: "conversations", icon: MessageSquare, module: "AI_WHATSAPP" },
  { href: "/portal/knowledge-base", key: "knowledgeBase", icon: BookOpen, module: "AI_WHATSAPP" },
  { href: "/portal/prompts", key: "prompts", icon: SlidersHorizontal, module: "AI_WHATSAPP" },
  { href: "/portal/ai-lab", key: "aiLab", icon: FlaskConical, module: "AI_WHATSAPP" },
  { href: "/portal/appointments", key: "appointments", icon: Calendar },
  { href: "/portal/reports", key: "reports", icon: BarChart3 },
  { href: "/portal/templates", key: "templates", icon: Layers, module: "AUTOMATIONS" },
  { href: "/portal/requests", key: "requests", icon: FileText },
  { href: "/portal/settings", key: "settings", icon: Settings },
];

interface PortalSidebarProps {
  orgName: string;
  orgLogoUrl?: string | null;
  enabledModules: PlatformModule[];
  pendingConversations?: number;
}

export function PortalSidebar({ orgName, orgLogoUrl: initialLogoUrl, enabledModules, pendingConversations = 0 }: PortalSidebarProps) {
  const pathname = usePathname();
  const { t, lang } = usePreferences();
  const labels = useNavItems();
  const visibleNavItems = NAV_ITEMS.filter((item) => !item.module || enabledModules.includes(item.module));

  const [logoDialogOpen, setLogoDialogOpen] = useState(false);
  const [logoUrl, setLogoUrl] = useState(initialLogoUrl ?? "");
  const [currentLogoUrl, setCurrentLogoUrl] = useState(initialLogoUrl);
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error(lang === "es" ? "Imagen demasiado grande (máx. 5MB)" : "Image too large (max 5MB)");
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new window.Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const size = 200;
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d")!;
        const minDim = Math.min(img.width, img.height);
        const sx = (img.width - minDim) / 2;
        const sy = (img.height - minDim) / 2;
        ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, size, size);
        setLogoUrl(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.src = event.target!.result as string;
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  function handleSaveLogo() {
    startTransition(async () => {
      try {
        await updateOrgLogo(logoUrl || null);
        setCurrentLogoUrl(logoUrl || null);
        setLogoDialogOpen(false);
        toast.success(t.success);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : t.error);
      }
    });
  }

  return (
    <>
      <aside className="flex h-screen w-64 flex-col border-r border-slate-200 bg-white">
        {/* Logo / Org — clickable to update logo */}
        <button
          onClick={() => { setLogoUrl(currentLogoUrl ?? ""); setLogoDialogOpen(true); }}
          className="flex h-16 items-center border-b border-slate-200 px-6 w-full text-left group hover:bg-slate-50 transition-colors"
        >
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <div className="relative flex-shrink-0">
              {currentLogoUrl ? (
                <img src={currentLogoUrl} alt={orgName} className="h-8 w-8 rounded-lg object-cover" />
              ) : (
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600">
                  <Zap className="h-4 w-4 text-white" />
                </div>
              )}
              <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
                <Upload className="h-3 w-3 text-white" />
              </div>
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-slate-900 leading-none">{orgName}</p>
              <p className="text-xs text-slate-500 leading-none mt-0.5">{t.aiOps}</p>
            </div>
          </div>
        </button>

        {/* Nav */}
        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {visibleNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-brand-50 text-brand-700"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
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
        <div className="border-t border-slate-200 p-3">
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors"
          >
            <LogOut className="h-4 w-4" />
            {t.signOut}
          </button>
        </div>
      </aside>

      {/* ── Org Logo Dialog ──────────────────────────────────────────── */}
      <Dialog open={logoDialogOpen} onOpenChange={(o) => !o && setLogoDialogOpen(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5 text-brand-600" />
              {t.orgLogoTitle}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Preview */}
            {logoUrl && (
              <div className="flex justify-center">
                <img src={logoUrl} alt="" className="h-20 w-20 rounded-xl object-cover ring-4 ring-brand-100" />
              </div>
            )}

            {/* Presets */}
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                {lang === "es" ? "Avatares predefinidos" : "Preset avatars"}
              </p>
              <div className="max-h-64 overflow-y-auto pr-0.5">
                <div className="grid grid-cols-4 gap-2">
                  {LOGO_PRESETS.map((url) => (
                    <button
                      key={url}
                      type="button"
                      onClick={() => setLogoUrl(url)}
                      className={cn(
                        "overflow-hidden rounded-lg border-2 transition-all",
                        logoUrl === url
                          ? "border-brand-600 scale-105"
                          : "border-transparent hover:border-brand-300"
                      )}
                    >
                      <img src={url} alt="" className="h-14 w-14 object-cover" />
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* File upload */}
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                {lang === "es" ? "O sube desde tu dispositivo" : "Or upload from your device"}
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileUpload}
              />
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-4 w-4 mr-2" />
                {lang === "es" ? "Elegir imagen" : "Choose image"}
              </Button>
            </div>

            {/* Manual URL */}
            <div className="space-y-1.5">
              <Label htmlFor="org-logo-url">{t.logoUrl}</Label>
              <Input
                id="org-logo-url"
                type="url"
                placeholder="https://..."
                value={logoUrl.startsWith("data:") ? "" : logoUrl}
                onChange={(e) => setLogoUrl(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLogoDialogOpen(false)}>{t.cancel}</Button>
            {currentLogoUrl && (
              <Button
                variant="outline"
                className="text-red-600 border-red-200 hover:bg-red-50"
                disabled={isPending}
                onClick={() => { setLogoUrl(""); handleSaveLogo(); }}
              >
                {t.removeLogo}
              </Button>
            )}
            <Button onClick={handleSaveLogo} disabled={isPending}>
              {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              {t.save}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
