import type { ClientRow } from "@/types/client";

import type { HubAlertsBundle, HubAlertItem } from "@/lib/agency-hub/alerts";
import { fetchHubAlerts } from "@/lib/agency-hub/alerts";
import { parseCommunicationAlertsJson } from "@/lib/agency-hub/communication-alerts";
import { parseGa4AlertsJson } from "@/lib/agency-hub/ga4-analytics-status";
import { parseGoogleAdsAlertsJson } from "@/lib/agency-hub/google-ads-account-status";
import { createSupabasePublicClient } from "@/lib/supabase/public";

function metricMonthStartUtc(d = new Date()) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString().slice(0, 10);
}

function hasAnyActiveGa4Alert(raw: unknown): boolean {
  const a = parseGa4AlertsJson(raw);
  if (!a) return false;
  return a.isTrafficCliff || a.isConversionGhost;
}

export type DashboardKpis = {
  overdueTasksTotal: number;
  needsReplyCount: number;
  staleAccountsCount: number;
  /** Count of active spend-drop + disapproval flags (can exceed client count). */
  adAlertsPriorityCount: number;
  ga4AlertsCount: number;
  /** Hub Lighthouse / PageSpeed rows (below threshold or audit error). */
  lighthouseIssueCount: number;
};

/**
 * Single-pass KPIs from current-month `client_metrics` (communication + Ads + GA4 flags).
 */
export async function fetchDashboardKpis(opts?: { signal?: AbortSignal }): Promise<DashboardKpis> {
  if (opts?.signal?.aborted) {
    throw opts.signal.reason ?? new DOMException("Aborted", "AbortError");
  }

  const supabase = createSupabasePublicClient();
  const month = metricMonthStartUtc();

  const { data: rows, error } = await supabase
    .from("client_metrics")
    .select("communication_alerts, google_ads_alerts, ga4_alerts")
    .eq("metric_month", month);

  if (error) throw new Error(error.message);

  let overdueTasksTotal = 0;
  let needsReplyCount = 0;
  let staleAccountsCount = 0;
  let adAlertsPriorityCount = 0;
  let ga4AlertsCount = 0;

  for (const row of rows ?? []) {
    const r = row as {
      communication_alerts: unknown;
      google_ads_alerts: unknown;
      ga4_alerts: unknown;
    };

    const comm = parseCommunicationAlertsJson(r.communication_alerts);
    if (comm) {
      overdueTasksTotal += Math.max(0, Math.floor(Number(comm.overdueCount)) || 0);
      if (comm.waitingForResponse === true) needsReplyCount += 1;
      const d = comm.daysSinceLastContact;
      if (d != null && Number.isFinite(d) && d >= 15) staleAccountsCount += 1;
    }

    const ads = parseGoogleAdsAlertsJson(r.google_ads_alerts);
    if (ads) {
      if (ads.spendDrop) adAlertsPriorityCount += 1;
      if (ads.hasDisapprovedAds) adAlertsPriorityCount += 1;
    }

    if (hasAnyActiveGa4Alert(r.ga4_alerts)) ga4AlertsCount += 1;
  }

  return {
    overdueTasksTotal,
    needsReplyCount,
    staleAccountsCount,
    adAlertsPriorityCount,
    ga4AlertsCount,
    lighthouseIssueCount: 0,
  };
}

export type NextBestAction = {
  id: string;
  tier: 1 | 2 | 3 | 4;
  title: string;
  subtitle: string;
  href: string;
  clientId: string;
  businessName: string;
};

/**
 * Priority: (1) needs reply → (2) disapproved ads → (3) overdue Basecamp tasks → (4) stale message board &gt; 30d.
 */
export function buildNextBestActions(bundle: HubAlertsBundle, limit = 5): NextBestAction[] {
  const candidates: NextBestAction[] = [];

  for (const row of bundle.communicationActionItems) {
    if (row.communicationActionKind === "needs_reply") {
      candidates.push({
        id: row.id,
        tier: 1,
        title: "Client waiting for response",
        subtitle: row.label,
        href: row.href,
        clientId: row.clientId,
        businessName: row.businessName,
      });
    }
  }

  for (const row of bundle.accountAds) {
    if (row.adsRuleKey === "hasDisapprovedAds") {
      candidates.push({
        id: row.id,
        tier: 2,
        title: "Disapproved Ads",
        subtitle: row.label,
        href: row.href,
        clientId: row.clientId,
        businessName: row.businessName,
      });
    }
  }

  for (const row of bundle.communication) {
    candidates.push({
      id: row.id,
      tier: 3,
      title: "Overdue Basecamp tasks",
      subtitle: row.label,
      href: row.href,
      clientId: row.clientId,
      businessName: row.businessName,
    });
  }

  for (const row of bundle.communicationActionItems) {
    if (row.communicationActionKind !== "stale") continue;
    const d = row.daysSinceLastContact;
    if (d == null || !Number.isFinite(d) || d <= 30) continue;
    candidates.push({
      id: row.id,
      tier: 4,
      title: "Stale account (message board)",
      subtitle: row.label,
      href: row.href,
      clientId: row.clientId,
      businessName: row.businessName,
    });
  }

  candidates.sort((a, b) => {
    if (a.tier !== b.tier) return a.tier - b.tier;
    return a.businessName.localeCompare(b.businessName);
  });

  return candidates.slice(0, limit);
}

export type ClientServiceRow = Pick<
  ClientRow,
  "id" | "business_name" | "active_services" | "google_ads_customer_id" | "search_console_url"
>;

export async function fetchClientsServiceRows(
  clientIds: string[],
  opts?: { signal?: AbortSignal },
): Promise<Map<string, ClientServiceRow>> {
  if (opts?.signal?.aborted) {
    throw opts.signal.reason ?? new DOMException("Aborted", "AbortError");
  }
  const uniq = [...new Set(clientIds.map((x) => String(x).trim()).filter(Boolean))];
  const map = new Map<string, ClientServiceRow>();
  if (uniq.length === 0) return map;

  const supabase = createSupabasePublicClient();
  const { data, error } = await supabase
    .from("clients")
    .select("id, business_name, active_services, google_ads_customer_id, search_console_url")
    .in("id", uniq);

  if (error) throw new Error(error.message);
  for (const row of data ?? []) {
    const r = row as ClientServiceRow;
    map.set(String(r.id), r);
  }
  return map;
}

export function collectClientIdsFromBundle(bundle: HubAlertsBundle): string[] {
  const lists = [
    bundle.accountAds,
    bundle.accountSeo,
    bundle.accountGa4,
    bundle.lighthouse,
    bundle.communication,
    bundle.communicationActionItems,
  ];
  return lists.flatMap((list) => list.map((x) => x.clientId));
}

export type DashboardWorkspacePayload = {
  bundle: HubAlertsBundle;
  kpis: DashboardKpis;
  nextBest: NextBestAction[];
};

export async function fetchDashboardWorkspacePayload(opts?: {
  signal?: AbortSignal;
}): Promise<DashboardWorkspacePayload> {
  const [bundle, baseKpis] = await Promise.all([fetchHubAlerts(opts), fetchDashboardKpis(opts)]);
  const kpis: DashboardKpis = {
    ...baseKpis,
    lighthouseIssueCount: bundle.lighthouse.length,
  };
  return { bundle, kpis, nextBest: buildNextBestActions(bundle) };
}

export type ServiceTag = "PPC" | "SEO" | "SMM";

export function serviceTagsForClient(c: ClientServiceRow | undefined): ServiceTag[] {
  if (!c) return [];
  const tags = new Set<ServiceTag>();
  if (c.google_ads_customer_id?.trim()) tags.add("PPC");
  if (c.search_console_url?.trim()) tags.add("SEO");
  if (c.active_services?.ppc) tags.add("PPC");
  if (c.active_services?.seo) tags.add("SEO");
  if (c.active_services?.social) tags.add("SMM");
  return [...tags];
}

export function businessInitials(name: string): string {
  const parts = String(name ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export type StaleTone = "healthy" | "warning" | "urgent";

/** Green &lt; 8 days, Yellow 8–14, Red 15+. */
export function daysStaleTone(days: number | null | undefined): StaleTone {
  if (days == null || !Number.isFinite(days)) return "healthy";
  const d = Math.floor(days);
  if (d < 8) return "healthy";
  if (d <= 14) return "warning";
  return "urgent";
}

export const TRIAGE_COLORS = {
  urgent: "#ef4444",
  warning: "#f59e0b",
  healthy: "#10b981",
} as const;

export function staleToneClasses(tone: StaleTone): string {
  if (tone === "urgent") return "border-[#ef4444]/40 bg-[#ef4444]/10 text-[#fecaca]";
  if (tone === "warning") return "border-[#f59e0b]/40 bg-[#f59e0b]/10 text-[#fde68a]";
  return "border-[#10b981]/40 bg-[#10b981]/10 text-[#a7f3d0]";
}

/** Best-effort “days stale” for a hub row (communication / comm actions / sitemap stale). */
export function daysStaleForHubRow(row: HubAlertItem): number | null {
  if (row.daysSinceLastContact != null && Number.isFinite(row.daysSinceLastContact)) {
    return row.daysSinceLastContact;
  }
  if (row.mostOverdueDays != null && Number.isFinite(row.mostOverdueDays)) {
    return row.mostOverdueDays;
  }
  return null;
}
