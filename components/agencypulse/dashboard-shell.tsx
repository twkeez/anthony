"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import { DashboardBreadcrumbProvider } from "@/lib/context/dashboard-breadcrumb";
import { DashboardSyncProvider, useDashboardSync } from "@/lib/context/dashboard-sync-context";
import { KittScanner } from "@/components/ui/kitt-scanner";

import { DashboardHeader } from "./dashboard-header";
import { DashboardSidebar } from "./dashboard-sidebar";
import { SettingsDialog } from "./settings-dialog";

function DashboardKittStrip() {
  const { isSyncing, isSlowSync } = useDashboardSync();
  return <KittScanner active={isSyncing} slow={isSlowSync} />;
}

export function DashboardShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    if (searchParams.get("settings") !== "1") return;
    setSettingsOpen(true);
    const next = new URLSearchParams(searchParams.toString());
    next.delete("settings");
    const qs = next.toString();
    router.replace(qs ? `${window.location.pathname}?${qs}` : window.location.pathname, { scroll: false });
  }, [router, searchParams]);

  return (
    <DashboardBreadcrumbProvider>
      <DashboardSyncProvider>
        <div className="flex min-h-screen bg-zinc-950 bg-[radial-gradient(ellipse_at_top_right,rgba(99,102,241,0.12),transparent_50%)] text-zinc-100">
          <DashboardSidebar
            mobileOpen={mobileNavOpen}
            onMobileOpenChange={setMobileNavOpen}
            onOpenSettings={() => setSettingsOpen(true)}
          />
          <div className="flex min-w-0 flex-1 flex-col md:pl-0">
            <DashboardHeader onOpenMobileNav={() => setMobileNavOpen(true)} onOpenSettings={() => setSettingsOpen(true)} />
            <DashboardKittStrip />
            <main className="flex-1 overflow-x-auto bg-gradient-to-br from-zinc-950 via-zinc-950 to-indigo-950/20 px-4 py-6 sm:px-8">
              {children}
            </main>
          </div>
        </div>
        <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
      </DashboardSyncProvider>
    </DashboardBreadcrumbProvider>
  );
}
