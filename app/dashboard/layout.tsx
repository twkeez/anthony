import type { ReactNode } from "react";
import { Suspense } from "react";

import { DashboardShell } from "@/components/agencypulse/dashboard-shell";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<div className="min-h-screen bg-zinc-950" aria-hidden />}>
      <DashboardShell>{children}</DashboardShell>
    </Suspense>
  );
}
