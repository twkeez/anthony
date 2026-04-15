"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { DashboardHubAlertListSection } from "@/components/agencypulse/dashboard-hub-alert-list";
import { DashboardKpiStatGrid } from "@/components/agencypulse/dashboard-kpi-stat-grid";
import { DashboardNextBestActions } from "@/components/agencypulse/dashboard-next-best-actions";
import { Button } from "@/components/ui/button";
import type { HubAlertsBundle } from "@/lib/agency-hub/alerts";
import { DashboardUnansweredMessagesSection } from "@/components/agencypulse/dashboard-unanswered-messages";
import { useDashboardSync } from "@/lib/context/dashboard-sync-context";
import {
  collectClientIdsFromBundle,
  fetchClientsServiceRows,
  fetchDashboardWorkspacePayload,
  type ClientServiceRow,
  type DashboardKpis,
  type NextBestAction,
} from "@/lib/agency-hub/dashboard-workspace";
import { cn } from "@/lib/utils";

const outerWell = "rounded-2xl border border-zinc-800/80 bg-zinc-950/50 p-4 sm:p-6";

export function DashboardWorkspaceAlerts() {
  const { runScopedSync, isSyncing } = useDashboardSync();
  const [bundle, setBundle] = useState<HubAlertsBundle | null>(null);
  const [kpis, setKpis] = useState<DashboardKpis | null>(null);
  const [nextBest, setNextBest] = useState<NextBestAction[]>([]);
  const [clientById, setClientById] = useState<Map<string, ClientServiceRow>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchDashboardWorkspacePayload();
      setBundle(data.bundle);
      setKpis(data.kpis);
      setNextBest(data.nextBest);
      const ids = collectClientIdsFromBundle(data.bundle);
      const cmap = await fetchClientsServiceRows(ids);
      setClientById(cmap);
      setLastRefreshed(new Date());
    } catch (e) {
      if ((e as { name?: string }).name === "AbortError") return;
      setError(e instanceof Error ? e.message : "Could not refresh workspace.");
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshInbox = useCallback(async () => {
    const res = await runScopedSync("communication");
    if (!res.ok) return;
    toast.success("Inbox Refreshed");
    await refresh();
  }, [refresh, runScopedSync]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const ads = bundle?.accountAds.filter((r) => r.type === "ads") ?? [];
  const seo = bundle?.accountSeo.filter((r) => r.type === "seo") ?? [];
  const ga4 = bundle?.accountGa4.filter((r) => r.type === "ga4") ?? [];
  const lighthouse = bundle?.lighthouse.filter((r) => r.type === "lighthouse") ?? [];
  const commActions = bundle?.communicationActionItems.filter((r) => r.type === "communication_action") ?? [];
  const comm = bundle?.communication.filter((r) => r.type === "communication") ?? [];
  const unansweredMessages = bundle?.unansweredClientMessages ?? [];

  return (
    <div className="flex flex-col gap-8">
      <div
        className={cn(
          outerWell,
          "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between",
        )}
      >
        <p className="text-sm leading-snug text-zinc-400">
          <strong className="text-zinc-100">Workspace</strong> pulls current-month{" "}
          <code className="rounded bg-zinc-900 px-1 font-mono text-[11px] text-sky-400/90">client_metrics</code> for
          Ads, sitemap, GA4, PageSpeed / Lighthouse, and Basecamp communication. KPIs and triage refresh with the same
          load as the lists.
        </p>
        <div className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={loading}
            onClick={() => void refresh()}
            className="border-zinc-600 bg-zinc-800 text-zinc-100 hover:bg-zinc-700"
          >
            {loading ? "Refreshing…" : "Refresh"}
          </Button>
          {lastRefreshed ? (
            <span className="text-right text-[10px] text-zinc-500">Last refresh {lastRefreshed.toLocaleString()}</span>
          ) : (
            <span className="text-right text-[10px] text-zinc-500">Loads on open</span>
          )}
        </div>
      </div>

      {error ? <p className="text-sm text-[#ef4444]">{error}</p> : null}

      <DashboardKpiStatGrid kpis={kpis} loading={loading && !kpis} />

      <DashboardNextBestActions items={nextBest} />

      <DashboardUnansweredMessagesSection rows={unansweredMessages} clientById={clientById} />

      <div className="flex flex-col gap-8">
        <DashboardHubAlertListSection
          title="Google Ads alerts"
          subtitle="Spend drop, disapprovals, flatline, and tracking flags from the latest metrics sync."
          rows={ads}
          clientById={clientById}
          emptyStateText="No active Ads alerts."
        />
        <DashboardHubAlertListSection
          title="Sitemap alerts"
          subtitle="Search Console sitemap health for clients with a property URL saved."
          rows={seo}
          clientById={clientById}
          emptyStateText="No sitemap alerts."
        />
        <DashboardHubAlertListSection
          title="Communication items"
          subtitle="Needs reply and stale message-board contact (15+ days). Internal senders use @beyond email; team name/id lists are a fallback when Basecamp omits email."
          rows={commActions}
          clientById={clientById}
          emptyStateText="No communication action items for this month."
          headerAction={
            <button
              type="button"
              disabled={isSyncing || loading}
              onClick={() => void refreshInbox()}
              className="inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-gradient-to-r from-violet-500 via-blue-500 to-sky-400 p-[1px] text-sm font-semibold shadow-sm transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className="rounded-[7px] bg-white px-3 py-1.5 text-sm font-semibold text-transparent bg-clip-text bg-gradient-to-r from-violet-600 to-sky-600">
                {isSyncing ? "Refreshing…" : "Refresh Inbox"}
              </span>
            </button>
          }
        />
        <DashboardHubAlertListSection
          title="Overdue Basecamp tasks"
          subtitle="Overdue to-dos mapped to clients after communication sync."
          rows={comm}
          clientById={clientById}
          emptyStateText="No overdue Basecamp tasks on record for this month."
        />
        <DashboardHubAlertListSection
          title="GA4 alerts"
          subtitle="Traffic cliff and conversion ghost flags from GA4 metrics sync."
          rows={ga4}
          clientById={clientById}
          emptyStateText="No GA4 alerts."
        />
        <DashboardHubAlertListSection
          title="PageSpeed / Lighthouse"
          subtitle="Performance under your Settings threshold or PSI audit errors. Needs client website + GOOGLE_PAGESPEED_API_KEY and metrics sync."
          rows={lighthouse}
          clientById={clientById}
          emptyStateText="No Lighthouse alerts for this month."
        />
      </div>
    </div>
  );
}
