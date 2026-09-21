"use client";

import { useState } from "react";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { TopBar } from "@/components/shared/TopBar";

interface AdminShellProps {
  adminName: string;
  orgLogoUrl: string | null;
  personalImageUrl: string | null;
  hasOrganization: boolean;
  children: React.ReactNode;
}

// Client wrapper so the off-canvas drawer's open/closed state can be shared
// between AdminSidebar and TopBar's hamburger button — both are rendered
// from (admin)/layout.tsx, a Server Component that can't hold useState
// itself. The layout still does all the data fetching; this only owns the
// one boolean neither sidebar nor topbar can own on its own. Mirrors
// PortalShell.tsx (same reasoning, separate file — same pattern as the two
// sidebars themselves being intentionally parallel, not shared).
export function AdminShell({ adminName, orgLogoUrl, personalImageUrl, hasOrganization, children }: AdminShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <AdminSidebar
        adminName={adminName}
        orgLogoUrl={orgLogoUrl}
        personalImageUrl={personalImageUrl}
        hasOrganization={hasOrganization}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />
      <div className="flex flex-1 flex-col min-h-0">
        <TopBar onMenuClick={() => setMobileOpen(true)} />
        <main className="flex-1 overflow-y-auto p-4 sm:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
