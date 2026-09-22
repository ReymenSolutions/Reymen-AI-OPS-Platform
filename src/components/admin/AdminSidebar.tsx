"use client";

import { useState, useTransition, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Zap,
  BarChart3,
  Settings,
  MessageSquare,
  LogOut,
  AlertTriangle,
  Layers,
  Shield,
  Code,
  Upload,
  Loader2,
  Webhook,
  Package,
  UserCog,
  X,
} from "lucide-react";
import { signOut } from "next-auth/react";
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

interface AdminSidebarProps {
  adminName: string;
  /** Organization logo — stored in organization.logoUrl, separate from user.image */
  orgLogoUrl?: string | null;
  /** Personal avatar (user.image) — used as the sidebar identity image for admins without an org */
  personalImageUrl?: string | null;
  /** False for super-admins that have no organization; they manage their personal avatar here instead */
  hasOrganization?: boolean;
  /** Off-canvas drawer state below `lg:` — controlled by AdminShell.tsx, which
   * also renders the hamburger toggle in TopBar. No effect at `lg:` and up,
   * where the sidebar is always visible exactly as before. */
  mobileOpen: boolean;
  onMobileClose: () => void;
}

export function AdminSidebar({
  adminName,
  orgLogoUrl: initialOrgLogoUrl,
  personalImageUrl: initialPersonalImageUrl,
  hasOrganization = false,
  mobileOpen,
  onMobileClose,
}: AdminSidebarProps) {
  const pathname = usePathname();
  const { t, lang } = usePreferences();

  const initialImageUrl = hasOrganization ? initialOrgLogoUrl : initialPersonalImageUrl;

  const [logoDialogOpen, setLogoDialogOpen] = useState(false);
  const [logoUrl, setLogoUrl] = useState(initialImageUrl ?? "");
  const [currentLogoUrl, setCurrentLogoUrl] = useState(initialImageUrl);
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const navItems = [
    { href: "/admin/dashboard", label: t.dashboard, icon: LayoutDashboard },
    { href: "/admin/clients", label: t.adminNavClients, icon: Users },
    { href: "/admin/users", label: t.adminNavUsers, icon: UserCog },
    { href: "/admin/automations", label: t.automations, icon: Zap },
    { href: "/admin/escalations", label: t.adminNavEscalations, icon: AlertTriangle },
    { href: "/admin/requests", label: t.requests, icon: MessageSquare },
    { href: "/admin/templates", label: t.templates, icon: Layers },
    { href: "/admin/template-packages", label: t.adminNavPackages, icon: Package },
    { href: "/admin/metrics", label: t.adminNavMetrics, icon: BarChart3 },
    { href: "/admin/audit", label: t.adminNavAudit, icon: Shield },
    { href: "/admin/webhooks", label: t.adminNavWebhooks, icon: Webhook },
    { href: "/admin/api-docs", label: "API Docs", icon: Code },
    { href: "/admin/settings", label: t.settings, icon: Settings },
  ];

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    // The raw file is only ever read into a canvas and re-encoded at 200x200
    // below, so this cap just guards against hanging on a huge decode — the
    // real size limit is updateAvatar()/updateOrgLogo()'s check on the
    // compressed result. Phone camera photos routinely run 8-15MB, so keep
    // this high.
    if (file.size > 20 * 1024 * 1024) {
      toast.error(lang === "es" ? "Imagen demasiado grande (máx. 20MB)" : "Image too large (max 20MB)");
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => {
      toast.error(lang === "es" ? "No se pudo leer la imagen" : "Could not read the image");
    };
    reader.onload = (event) => {
      const img = new window.Image();
      img.onerror = () => {
        toast.error(lang === "es" ? "Formato de imagen no compatible" : "Unsupported image format");
      };
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

  function handleRemoveLogo() {
    startTransition(async () => {
      try {
        await updateOrgLogo(null);
        setLogoUrl("");
        setCurrentLogoUrl(null);
        setLogoDialogOpen(false);
        toast.success(t.success);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : t.error);
      }
    });
  }

  return (
    <>
      {/*
        Light theme: Reymen brand navy (matches the physical NFC card /
        marketing identity) — a deliberate visual choice, not a bug fix.
        Dark mode must stay exactly as it is today. This app's dark mode
        works by remapping Tailwind's color CSS variables under a plain
        `.dark` class selector (globals.css) — NOT via Tailwind's `dark:`
        utility variant, which in this project's Tailwind v4 setup compiles
        to `@media (prefers-color-scheme: dark)` (no `@custom-variant dark`
        override), completely disconnected from the `.dark` class
        preferences.tsx actually toggles. So the classes below use plain
        hook classNames (sidebar*) + matching `.dark .sidebar*`
        overrides in globals.css, the same pattern already used there,
        instead of `dark:` utilities that would silently never apply.
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
        {/* Logo — clickable to change the org logo when the admin has an org;
            avatar changes for admins without an org live only in the profile
            menu (TopBar, top right) now, not duplicated here. */}
        <div className="sidebar-header flex h-16 items-center border-b border-white/10 px-6 transition-colors hover:bg-white/5">
          {hasOrganization ? (
            <button
              onClick={() => {
                setLogoUrl(currentLogoUrl ?? "");
                setLogoDialogOpen(true);
              }}
              className="group flex min-w-0 flex-1 items-center gap-2 text-left cursor-pointer"
            >
              <div className="relative flex-shrink-0">
                {currentLogoUrl ? (
                  <img src={currentLogoUrl} alt={adminName} className="h-8 w-8 rounded-lg object-cover" />
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
                <p className="sidebar-name truncate text-sm font-bold text-white leading-none">{adminName}</p>
                <p className="sidebar-subtitle text-xs text-brand-200 leading-none mt-0.5">Admin</p>
              </div>
            </button>
          ) : (
            <div className="flex min-w-0 flex-1 items-center gap-2">
              {currentLogoUrl ? (
                <img src={currentLogoUrl} alt={adminName} className="h-8 w-8 flex-shrink-0 rounded-lg object-cover" />
              ) : (
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-brand-600">
                  <Zap className="h-4 w-4 text-white" />
                </div>
              )}
              <div className="min-w-0">
                <p className="sidebar-name truncate text-sm font-bold text-white leading-none">{adminName}</p>
                <p className="sidebar-subtitle text-xs text-brand-200 leading-none mt-0.5">Admin</p>
              </div>
            </div>
          )}
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
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname.startsWith(item.href);
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
                {item.label}
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

      {/* ── Logo Dialog ──────────────────────────────────────────── */}
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
              <Label htmlFor="admin-logo-url">{t.logoUrl}</Label>
              <Input
                id="admin-logo-url"
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
                onClick={handleRemoveLogo}
              >
                {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                {t.removeLogo}
              </Button>
            )}
            <Button onClick={handleSaveLogo} disabled={isPending || !logoUrl}>
              {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              {t.save}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
