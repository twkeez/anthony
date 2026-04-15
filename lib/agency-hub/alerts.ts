import { createSupabasePublicClient } from "@/lib/supabase/public";
import { fetchGlobalMinPerformanceScore } from "@/lib/data/app-thresholds";
import { normalizeWebsiteForPageSpeed } from "@/lib/google/pagespeed-lighthouse";
import {
  parseGoogleAdsAlertsJson,
  type GoogleAdsAlertsState,
} from "@/lib/agency-hub/google-ads-account-status";
import {
  hasActiveCommunicationAlert,
  parseCommunicationAlertsJson,
  type CommunicationActionability,
  type CommunicationAlertsState,
} from "@/lib/agency-hub/communication-alerts";
import { parseGa4AlertsJson, type Ga4AlertsState } from "@/lib/agency-hub/ga4-analytics-status";

/**
 * Hub homepage alert rows — shared shape for placeholder data and future live feeds.
 * When you add real data, keep returning `HubAlertItem[]` from your API or server action.
 */
export type HubAlertActionBadge = { text: string; variant: "danger" | "warning" };

export type HubAlertItem = {
  id: string;
  clientId: string;
  businessName: string;
  label: string;
  /** Target for "Dive In" until dedicated alert routes exist */
  href: string;
  /** Google Ads rule flags vs Search Console / sitemap; omitted on communication preview rows. */
  type?: "ads" | "seo" | "ga4" | "communication" | "communication_action" | "lighthouse";
  /** Lighthouse performance 0–100 when the row is a below-threshold alert. */
  lighthousePerformance?: number;
  /** Basecamp overdue severity for dashboard styling. */
  severity?: "red" | "yellow";
  /** Communication Action Items: drives icon (message vs clock) in hub/dashboard UI. */
  communicationActionKind?: "needs_reply" | "stale";
  /** @deprecated legacy rows; prefer communicationActionKind */
  actionBadges?: HubAlertActionBadge[];
  /** Which Ads rule fired (ads rows only). */
  adsRuleKey?: keyof GoogleAdsAlertsState;
  /** Total overdue Basecamp tasks for this client (communication overdue row). */
  overdueTaskCount?: number;
  /** Longest overdue span in days when available. */
  mostOverdueDays?: number;
  /** Message-board staleness for communication_action stale rows. */
  daysSinceLastContact?: number | null;
  /** Last message-board author label (when present on the snapshot). */
  communicationLastAuthor?: string | null;
  /** True when the last board post was from an internal (@beyond / team) user. */
  communicationLastAuthorIsInternal?: boolean;
};

/** Flattened client message-board threads awaiting team (from `unansweredClientThreads`). */
export type UnansweredClientMessageRow = {
  id: string;
  clientId: string;
  businessName: string;
  subject: string;
  excerpt: string;
  daysWaiting: number;
  updatedAt: string;
  webUrl?: string;
  actionability: CommunicationActionability;
  suggestedAction: string;
  authorName?: string;
};

function metricMonthStartUtc(d = new Date()) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString().slice(0, 10);
}

const HUB_ALERT_TYPE_ORDER: { key: keyof GoogleAdsAlertsState; typeLabel: string }[] = [
  { key: "isFlatlined", typeLabel: "0 Impressions (Flatline)" },
  { key: "hasDisapprovedAds", typeLabel: "Disapproved Ads (Policy)" },
  { key: "brokenTracking", typeLabel: "Broken Tracking" },
  { key: "spendDrop", typeLabel: "Spend Drop" },
];

const HUB_GA4_ALERT_ORDER: { key: keyof Ga4AlertsState; typeLabel: string }[] = [
  { key: "isTrafficCliff", typeLabel: "Traffic Cliff" },
  { key: "isConversionGhost", typeLabel: "Conversion Ghost" },
];

function utcCalendarDay(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** Whole UTC days from sitemap last-download to today; null if unknown or invalid. */
function daysSinceSitemapDownload(iso: string | null | undefined): number | null {
  if (iso == null || iso === "") return null;
  const crawled = new Date(iso);
  if (Number.isNaN(crawled.getTime())) return null;
  const diffDays = Math.floor((utcCalendarDay(new Date()) - utcCalendarDay(crawled)) / 86400000);
  return diffDays >= 0 ? diffDays : null;
}

function hasAnyActiveGoogleAdsAlert(raw: unknown): boolean {
  const a = parseGoogleAdsAlertsJson(raw);
  if (!a) return false;
  return a.isFlatlined || a.hasDisapprovedAds || a.brokenTracking || a.spendDrop;
}

function hasAnyActiveGa4Alert(raw: unknown): boolean {
  const a = parseGa4AlertsJson(raw);
  if (!a) return false;
  return a.isTrafficCliff || a.isConversionGhost;
}

/**
 * Builds hub rows from current-month `client_metrics.google_ads_alerts` + client names.
 * One row per active flag per client. `href` points at the client dashboard.
 */
export async function fetchHubGoogleAdsAccountAlerts(opts?: {
  signal?: AbortSignal;
}): Promise<HubAlertItem[]> {
  if (opts?.signal?.aborted) {
    throw opts.signal.reason ?? new DOMException("Aborted", "AbortError");
  }

  const supabase = createSupabasePublicClient();
  const month = metricMonthStartUtc();

  const { data: metricRows, error: mErr } = await supabase
    .from("client_metrics")
    .select("client_id, google_ads_alerts")
    .eq("metric_month", month);

  if (mErr) throw new Error(mErr.message);

  const active: { clientId: string; raw: unknown }[] = [];
  for (const row of metricRows ?? []) {
    const r = row as { client_id: string; google_ads_alerts: unknown };
    if (r.google_ads_alerts == null) continue;
    if (!hasAnyActiveGoogleAdsAlert(r.google_ads_alerts)) continue;
    active.push({ clientId: String(r.client_id), raw: r.google_ads_alerts });
  }

  if (active.length === 0) return [];

  const ids = [...new Set(active.map((x) => x.clientId))];
  const { data: clientRows, error: cErr } = await supabase
    .from("clients")
    .select("id, business_name")
    .in("id", ids);

  if (cErr) throw new Error(cErr.message);

  const names = new Map<string, string>();
  for (const row of clientRows ?? []) {
    const r = row as { id: string; business_name: string | null };
    names.set(String(r.id), (r.business_name ?? "Client").trim() || "Client");
  }

  const out: HubAlertItem[] = [];
  for (const { clientId, raw } of active) {
    const parsed = parseGoogleAdsAlertsJson(raw);
    if (!parsed) continue;
    const businessName = names.get(clientId) ?? "Client";
    for (const { key, typeLabel } of HUB_ALERT_TYPE_ORDER) {
      if (!parsed[key]) continue;
      out.push({
        id: `${clientId}-${key}`,
        clientId,
        businessName,
        label: `${businessName} - ${typeLabel} (Ads)`,
        href: `/dashboard/clients/${clientId}`,
        type: "ads",
        adsRuleKey: key,
      });
    }
  }

  out.sort((a, b) => a.label.localeCompare(b.label));
  return out;
}

/**
 * GA4 rule flags from `client_metrics.ga4_alerts` for the current metric month.
 */
export async function fetchHubGa4AnalyticsAlerts(opts?: { signal?: AbortSignal }): Promise<HubAlertItem[]> {
  if (opts?.signal?.aborted) {
    throw opts.signal.reason ?? new DOMException("Aborted", "AbortError");
  }

  const supabase = createSupabasePublicClient();
  const month = metricMonthStartUtc();

  const { data: metricRows, error: mErr } = await supabase
    .from("client_metrics")
    .select("client_id, ga4_alerts")
    .eq("metric_month", month);

  if (mErr) throw new Error(mErr.message);

  const active: { clientId: string; raw: unknown }[] = [];
  for (const row of metricRows ?? []) {
    const r = row as { client_id: string; ga4_alerts: unknown };
    if (r.ga4_alerts == null) continue;
    if (!hasAnyActiveGa4Alert(r.ga4_alerts)) continue;
    active.push({ clientId: String(r.client_id), raw: r.ga4_alerts });
  }

  if (active.length === 0) return [];

  const ids = [...new Set(active.map((x) => x.clientId))];
  const { data: clientRows, error: cErr } = await supabase
    .from("clients")
    .select("id, business_name")
    .in("id", ids);

  if (cErr) throw new Error(cErr.message);

  const names = new Map<string, string>();
  for (const row of clientRows ?? []) {
    const r = row as { id: string; business_name: string | null };
    names.set(String(r.id), (r.business_name ?? "Client").trim() || "Client");
  }

  const out: HubAlertItem[] = [];
  for (const { clientId, raw } of active) {
    const parsed = parseGa4AlertsJson(raw);
    if (!parsed) continue;
    const businessName = names.get(clientId) ?? "Client";
    for (const { key, typeLabel } of HUB_GA4_ALERT_ORDER) {
      if (!parsed[key]) continue;
      out.push({
        id: `${clientId}-ga4-${key}`,
        clientId,
        businessName,
        label: `${businessName} - ${typeLabel}`,
        href: `/dashboard/clients/${clientId}`,
        type: "ga4",
      });
    }
  }

  out.sort((a, b) => a.label.localeCompare(b.label));
  return out;
}

/**
 * SEO / GSC sitemap issues for clients with a Search Console property URL: error or missing status,
 * or last Google download older than 90 days.
 */
export async function fetchHubSitemapSeoAlerts(opts?: { signal?: AbortSignal }): Promise<HubAlertItem[]> {
  if (opts?.signal?.aborted) {
    throw opts.signal.reason ?? new DOMException("Aborted", "AbortError");
  }

  const supabase = createSupabasePublicClient();
  const month = metricMonthStartUtc();

  const { data: clientRows, error: cErr } = await supabase
    .from("clients")
    .select("id, business_name, search_console_url");

  if (cErr) throw new Error(cErr.message);

  const withGsc = (clientRows ?? []).filter((row) => {
    const url = (row as { search_console_url: string | null }).search_console_url;
    return typeof url === "string" && url.trim() !== "";
  }) as { id: string; business_name: string | null; search_console_url: string }[];

  if (withGsc.length === 0) return [];

  const ids = withGsc.map((c) => String(c.id));
  const { data: metricRows, error: mErr } = await supabase
    .from("client_metrics")
    .select("client_id, sitemap_status, sitemap_last_downloaded")
    .eq("metric_month", month)
    .in("client_id", ids);

  if (mErr) throw new Error(mErr.message);

  const byClient = new Map<string, { sitemap_status: string | null; sitemap_last_downloaded: string | null }>();
  for (const row of metricRows ?? []) {
    const r = row as {
      client_id: string;
      sitemap_status: string | null;
      sitemap_last_downloaded: string | null;
    };
    byClient.set(String(r.client_id), {
      sitemap_status: r.sitemap_status != null ? String(r.sitemap_status) : null,
      sitemap_last_downloaded:
        r.sitemap_last_downloaded != null ? String(r.sitemap_last_downloaded) : null,
    });
  }

  const out: HubAlertItem[] = [];
  for (const c of withGsc) {
    const clientId = String(c.id);
    const businessName = (c.business_name ?? "Client").trim() || "Client";
    const m = byClient.get(clientId);
    const statusRaw = m?.sitemap_status?.trim() ?? "";
    const lastDl = m?.sitemap_last_downloaded ?? null;

    if (statusRaw === "Error") {
      out.push({
        id: `${clientId}-sitemap-error`,
        clientId,
        businessName,
        label: `${businessName} - Sitemap Error (SEO)`,
        href: `/dashboard/clients/${clientId}`,
        type: "seo",
      });
    } else if (!statusRaw) {
      out.push({
        id: `${clientId}-sitemap-missing`,
        clientId,
        businessName,
        label: `${businessName} - Sitemap status missing (SEO)`,
        href: `/dashboard/clients/${clientId}`,
        type: "seo",
      });
    }

    const days = daysSinceSitemapDownload(lastDl);
    if (days != null && days > 90) {
      out.push({
        id: `${clientId}-sitemap-stale`,
        clientId,
        businessName,
        label: `${businessName} - Stale Sitemap (>90 Days) (SEO)`,
        href: `/dashboard/clients/${clientId}`,
        type: "seo",
        daysSinceLastContact: days,
      });
    }
  }

  out.sort((a, b) => a.label.localeCompare(b.label));
  return out;
}

/**
 * Overdue Basecamp tasks from `client_metrics.communication_alerts` (current metric month).
 */
export async function fetchHubCommunicationAlerts(opts?: { signal?: AbortSignal }): Promise<HubAlertItem[]> {
  if (opts?.signal?.aborted) {
    throw opts.signal.reason ?? new DOMException("Aborted", "AbortError");
  }

  const supabase = createSupabasePublicClient();
  const month = metricMonthStartUtc();

  const { data: metricRows, error: mErr } = await supabase
    .from("client_metrics")
    .select("client_id, communication_alerts")
    .eq("metric_month", month);

  if (mErr) throw new Error(mErr.message);

  const active: { clientId: string; raw: unknown }[] = [];
  for (const row of metricRows ?? []) {
    const r = row as { client_id: string; communication_alerts: unknown };
    if (r.communication_alerts == null) continue;
    if (!hasActiveCommunicationAlert(r.communication_alerts)) continue;
    active.push({ clientId: String(r.client_id), raw: r.communication_alerts });
  }

  if (active.length === 0) return [];

  const ids = [...new Set(active.map((x) => x.clientId))];
  const { data: clientRows, error: cErr } = await supabase
    .from("clients")
    .select("id, business_name")
    .in("id", ids);

  if (cErr) throw new Error(cErr.message);

  const names = new Map<string, string>();
  for (const row of clientRows ?? []) {
    const r = row as { id: string; business_name: string | null };
    names.set(String(r.id), (r.business_name ?? "Client").trim() || "Client");
  }

  const out: HubAlertItem[] = [];
  for (const { clientId, raw } of active) {
    const parsed = parseCommunicationAlertsJson(raw);
    if (!parsed || parsed.overdueCount <= 0) continue;
    const businessName = names.get(clientId) ?? "Client";
    const severityLabel = parsed.status === "red" ? "7+ days late" : "Due within the last week";
    out.push({
      id: `${clientId}-comms-overdue`,
      clientId,
      businessName,
      label: `${businessName} - ${parsed.overdueCount} overdue Basecamp task(s) (${severityLabel})`,
      href: `/dashboard/clients/${clientId}`,
      type: "communication",
      severity: parsed.status === "red" ? "red" : "yellow",
      overdueTaskCount: parsed.overdueCount,
      mostOverdueDays: parsed.mostOverdueDays,
    });
  }

  out.sort((a, b) => a.label.localeCompare(b.label));
  return out;
}

/**
 * Communication Action Items: one row per flag (needs reply vs stale), from `communication_alerts`
 * on the current metric month. Icons are chosen in the UI via `communicationActionKind`.
 */
export async function fetchHubCommunicationActionItems(opts?: { signal?: AbortSignal }): Promise<HubAlertItem[]> {
  if (opts?.signal?.aborted) {
    throw opts.signal.reason ?? new DOMException("Aborted", "AbortError");
  }

  const supabase = createSupabasePublicClient();
  const month = metricMonthStartUtc();

  const { data: metricRows, error: mErr } = await supabase
    .from("client_metrics")
    .select("client_id, communication_alerts")
    .eq("metric_month", month);

  if (mErr) throw new Error(mErr.message);

  const needsLookup: { clientId: string; parsed: CommunicationAlertsState }[] = [];
  for (const row of metricRows ?? []) {
    const r = row as { client_id: string; communication_alerts: unknown };
    if (r.communication_alerts == null) continue;
    const parsed = parseCommunicationAlertsJson(r.communication_alerts);
    if (!parsed) continue;
    if (
      parsed.waitingForResponse === true ||
      (parsed.daysSinceLastContact != null &&
        Number.isFinite(parsed.daysSinceLastContact) &&
        parsed.daysSinceLastContact >= 15)
    ) {
      needsLookup.push({ clientId: String(r.client_id), parsed });
    }
  }

  if (needsLookup.length === 0) return [];

  const ids = [...new Set(needsLookup.map((x) => x.clientId))];
  const { data: clientRows, error: cErr } = await supabase
    .from("clients")
    .select("id, business_name")
    .in("id", ids);

  if (cErr) throw new Error(cErr.message);

  const names = new Map<string, string>();
  for (const row of clientRows ?? []) {
    const r = row as { id: string; business_name: string | null };
    names.set(String(r.id), (r.business_name ?? "Client").trim() || "Client");
  }

  const out: HubAlertItem[] = [];
  for (const { clientId, parsed } of needsLookup) {
    const businessName = names.get(clientId) ?? "Client";
    const communicationLastAuthor = (parsed.lastMessageAuthor ?? "").trim() || null;
    const communicationLastAuthorIsInternal = parsed.is_internal_author === true;
    if (parsed.waitingForResponse === true) {
      out.push({
        id: `${clientId}-comm-action-needs-reply`,
        clientId,
        businessName,
        label: `Needs Reply — ${businessName}`,
        href: `/dashboard/clients/${clientId}`,
        type: "communication_action",
        communicationActionKind: "needs_reply",
        severity: "red",
        daysSinceLastContact: parsed.daysSinceLastContact ?? null,
        ...(communicationLastAuthor ? { communicationLastAuthor } : {}),
      });
    }
    const d = parsed.daysSinceLastContact;
    if (d != null && Number.isFinite(d) && d >= 15) {
      out.push({
        id: `${clientId}-comm-action-stale`,
        clientId,
        businessName,
        label: `Stale Account — ${businessName} (${Math.round(d)} days since last message-board activity)`,
        href: `/dashboard/clients/${clientId}`,
        type: "communication_action",
        communicationActionKind: "stale",
        severity: "yellow",
        daysSinceLastContact: d,
        ...(communicationLastAuthor ? { communicationLastAuthor } : {}),
        ...(communicationLastAuthorIsInternal ? { communicationLastAuthorIsInternal: true } : {}),
      });
    }
  }

  out.sort((a, b) => a.label.localeCompare(b.label));
  return out;
}

/**
 * Client-authored message board threads with no team reply yet (from `communication_alerts.unansweredClientThreads`).
 * Sorted by most recent `updatedAt` first (matches communication command center inbox).
 */
export async function fetchHubUnansweredClientMessages(opts?: { signal?: AbortSignal }): Promise<
  UnansweredClientMessageRow[]
> {
  if (opts?.signal?.aborted) {
    throw opts.signal.reason ?? new DOMException("Aborted", "AbortError");
  }

  const supabase = createSupabasePublicClient();
  const month = metricMonthStartUtc();

  const { data: metricRows, error: mErr } = await supabase
    .from("client_metrics")
    .select("client_id, communication_alerts")
    .eq("metric_month", month);

  if (mErr) throw new Error(mErr.message);

  const pending: { clientId: string; threads: NonNullable<CommunicationAlertsState["unansweredClientThreads"]> }[] =
    [];
  for (const row of metricRows ?? []) {
    const r = row as { client_id: string; communication_alerts: unknown };
    if (r.communication_alerts == null) continue;
    const parsed = parseCommunicationAlertsJson(r.communication_alerts);
    const threads = parsed?.unansweredClientThreads;
    if (!threads || threads.length === 0) continue;
    pending.push({ clientId: String(r.client_id), threads });
  }

  if (pending.length === 0) return [];

  const ids = [...new Set(pending.map((p) => p.clientId))];
  const { data: clientRows, error: cErr } = await supabase.from("clients").select("id, business_name").in("id", ids);
  if (cErr) throw new Error(cErr.message);

  const names = new Map<string, string>();
  for (const row of clientRows ?? []) {
    const r = row as { id: string; business_name: string | null };
    names.set(String(r.id), (r.business_name ?? "Client").trim() || "Client");
  }

  const out: UnansweredClientMessageRow[] = [];
  for (const { clientId, threads } of pending) {
    const businessName = names.get(clientId) ?? "Client";
    threads.forEach((t, idx) => {
      out.push({
        id: `${clientId}-unanswered-${idx}-${t.updatedAt}`,
        clientId,
        businessName,
        subject: t.subject,
        excerpt: t.excerpt,
        daysWaiting: t.daysWaiting,
        updatedAt: t.updatedAt,
        ...(t.webUrl ? { webUrl: t.webUrl } : {}),
        actionability: t.actionability,
        suggestedAction: t.suggestedAction,
        ...(t.authorName ? { authorName: t.authorName } : {}),
      });
    });
  }

  out.sort((a, b) => {
    const ta = new Date(a.updatedAt).getTime();
    const tb = new Date(b.updatedAt).getTime();
    return (Number.isFinite(tb) ? tb : 0) - (Number.isFinite(ta) ? ta : 0);
  });
  return out;
}

/**
 * PageSpeed / Lighthouse: clients with a `website` URL and either a PSI error string or
 * performance score below `app_thresholds.rules.min_performance_score` (default 50).
 */
export async function fetchHubLighthouseAlerts(opts?: { signal?: AbortSignal }): Promise<HubAlertItem[]> {
  if (opts?.signal?.aborted) {
    throw opts.signal.reason ?? new DOMException("Aborted", "AbortError");
  }

  const minPerf = await fetchGlobalMinPerformanceScore(opts);
  const supabase = createSupabasePublicClient();
  const month = metricMonthStartUtc();

  const { data: clientRows, error: cErr } = await supabase.from("clients").select("id, business_name, website");
  if (cErr) throw new Error(cErr.message);

  const withSite = (clientRows ?? []).filter((row) => {
    const url = normalizeWebsiteForPageSpeed((row as { website?: string | null }).website);
    return url != null;
  }) as { id: string; business_name: string | null; website: string | null }[];

  if (withSite.length === 0) return [];

  const ids = withSite.map((c) => String(c.id));
  const { data: metricRows, error: mErr } = await supabase
    .from("client_metrics")
    .select("client_id, lighthouse_performance, lighthouse_error")
    .eq("metric_month", month)
    .in("client_id", ids);

  if (mErr) throw new Error(mErr.message);

  const byClient = new Map<
    string,
    { lighthouse_performance: number | null; lighthouse_error: string | null }
  >();
  for (const row of metricRows ?? []) {
    const r = row as {
      client_id: string;
      lighthouse_performance: unknown;
      lighthouse_error: unknown;
    };
    const perf =
      r.lighthouse_performance != null && Number.isFinite(Number(r.lighthouse_performance))
        ? Math.round(Number(r.lighthouse_performance))
        : null;
    const err =
      r.lighthouse_error != null && String(r.lighthouse_error).trim() !== ""
        ? String(r.lighthouse_error).trim()
        : null;
    byClient.set(String(r.client_id), { lighthouse_performance: perf, lighthouse_error: err });
  }

  const out: HubAlertItem[] = [];
  for (const c of withSite) {
    const clientId = String(c.id);
    const businessName = (c.business_name ?? "Client").trim() || "Client";
    const m = byClient.get(clientId);
    if (!m) continue;

    if (m.lighthouse_error) {
      const shortErr =
        m.lighthouse_error.length > 120 ? `${m.lighthouse_error.slice(0, 117)}…` : m.lighthouse_error;
      out.push({
        id: `${clientId}-lighthouse-error`,
        clientId,
        businessName,
        label: `${businessName} - PageSpeed audit failed (${shortErr})`,
        href: `/dashboard/clients/${clientId}`,
        type: "lighthouse",
      });
      continue;
    }

    if (m.lighthouse_performance != null && m.lighthouse_performance < minPerf) {
      out.push({
        id: `${clientId}-lighthouse-low`,
        clientId,
        businessName,
        label: `${businessName} - PageSpeed performance ${m.lighthouse_performance} (threshold ${minPerf})`,
        href: `/dashboard/clients/${clientId}`,
        type: "lighthouse",
        lighthousePerformance: m.lighthouse_performance,
      });
    }
  }

  out.sort((a, b) => a.label.localeCompare(b.label));
  return out;
}

export type HubAlertsBundle = {
  accountAds: HubAlertItem[];
  accountSeo: HubAlertItem[];
  accountGa4: HubAlertItem[];
  lighthouse: HubAlertItem[];
  communication: HubAlertItem[];
  communicationActionItems: HubAlertItem[];
  unansweredClientMessages: UnansweredClientMessageRow[];
};

/**
 * Loads hub alerts: Ads, SEO, GA4, Lighthouse / PageSpeed, Basecamp communication (overdue tasks), and communication action items.
 */
export async function fetchHubAlerts(opts?: { signal?: AbortSignal }): Promise<HubAlertsBundle> {
  const [accountAds, accountSeo, accountGa4, lighthouse, communication, communicationActionItems, unansweredClientMessages] =
    await Promise.all([
      fetchHubGoogleAdsAccountAlerts(opts),
      fetchHubSitemapSeoAlerts(opts),
      fetchHubGa4AnalyticsAlerts(opts),
      fetchHubLighthouseAlerts(opts),
      fetchHubCommunicationAlerts(opts),
      fetchHubCommunicationActionItems(opts),
      fetchHubUnansweredClientMessages(opts),
    ]);
  return {
    accountAds,
    accountSeo,
    accountGa4,
    lighthouse,
    communication,
    communicationActionItems,
    unansweredClientMessages,
  };
}
