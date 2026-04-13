import type { Metadata } from "next";
import { Suspense } from "react";

import { AgencyWorkspaceHero } from "@/components/agencypulse/agency-workspace-hero";
import { DashboardShell } from "@/components/agencypulse/dashboard-shell";
import { DashboardWorkspaceAlerts } from "@/components/agencypulse/dashboard-workspace-alerts";

export const metadata: Metadata = {
  title: "anthony · workspace",
  description: "anthony workspace — KPIs, triage, and alerts for the current metric month.",
};

type Search = Record<string, string | string[] | undefined>;

function first(param: string | string[] | undefined) {
  if (Array.isArray(param)) return param[0];
  return param;
}

export default async function HomePage(props: { searchParams?: Promise<Search> }) {
  const searchParams = (await props.searchParams) ?? {};
  const googleError = first(searchParams.google_error);
  const googleConnected = first(searchParams.google_connected);

  return (
    <Suspense fallback={<div className="min-h-screen bg-zinc-950" aria-hidden />}>
      <DashboardShell>
        <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-8">
          <AgencyWorkspaceHero tagline="KPIs, triage, and workspace alerts from the current month — sync metrics to refresh." />

          {googleConnected ? (
            <p className="text-emerald-400 text-sm font-bold lowercase">
              Google account connected — tokens stored for the agency MCC flow.
            </p>
          ) : null}
          {googleError ? (
            <p className="text-red-400 text-sm font-bold lowercase">
              Google OAuth: {decodeURIComponent(googleError.replace(/\+/g, " "))}
            </p>
          ) : null}

          <DashboardWorkspaceAlerts />
        </div>
      </DashboardShell>
    </Suspense>
  );
}
