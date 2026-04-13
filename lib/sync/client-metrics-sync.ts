import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getGoogleAccessTokenFromRefresh } from "@/lib/google/access-token";
import { fetchAdsMonthTotals } from "@/lib/google/ads-metrics";
import { fetchGoogleAdsAlertsFromGaql } from "@/lib/google/google-ads";
import { fetchGa4SyncBundle } from "@/lib/google/ga4";
import { fetchGscSearchAnalyticsSnapshot } from "@/lib/google/gsc-search-analytics";
import { fetchGscSitemapSnapshot } from "@/lib/google/gsc-sitemaps";
import { isSearchConsoleAccessDenied } from "@/lib/google/gsc-api-errors";
import {
  fetchPageSpeedLighthouseScores,
  normalizeWebsiteForPageSpeed,
} from "@/lib/google/pagespeed-lighthouse";
import { type GoogleAdsAlertsState, parseGoogleAdsAlertsJson } from "@/lib/agency-hub/google-ads-account-status";
import { type CommunicationAlertsState, parseCommunicationAlertsJson } from "@/lib/agency-hub/communication-alerts";
import { type Ga4AlertsState, parseGa4AlertsJson } from "@/lib/agency-hub/ga4-analytics-status";
import type { TopOrganicQuery } from "@/types/database.types";

function monthStartDate(d = new Date()) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString().slice(0, 10);
}

function finiteOrNull(n: number): number | null {
  return Number.isFinite(n) ? n : null;
}

/** Subset sync for command-center buttons; omit for full sync (Sync all / per-client full). */
export type MetricsSyncScope = "ads" | "ga4" | "gsc" | "lighthouse";

function scopeRunsAll(scope: MetricsSyncScope | undefined): boolean {
  return scope == null;
}

function runAdsScope(scope: MetricsSyncScope | undefined): boolean {
  return scopeRunsAll(scope) || scope === "ads";
}

function runGa4Scope(scope: MetricsSyncScope | undefined): boolean {
  return scopeRunsAll(scope) || scope === "ga4";
}

function runGscScope(scope: MetricsSyncScope | undefined): boolean {
  return scopeRunsAll(scope) || scope === "gsc";
}

function runLighthouseScope(scope: MetricsSyncScope | undefined): boolean {
  return scopeRunsAll(scope) || scope === "lighthouse";
}

export type SyncClientMetricsResult = {
  metric_month: string;
  ads_spend: number | null;
  ads_conversions: number | null;
  ads_clicks: number | null;
  ads_impressions: number | null;
  ads_ctr: number | null;
  ads_average_cpc: number | null;
  ads_search_impression_share: number | null;
  ads_search_rank_lost_impression_share: number | null;
  ads_search_budget_lost_impression_share: number | null;
  ads_search_abs_top_impression_share: number | null;
  ga4_sessions: number | null;
  ga4_key_events: number | null;
  ga4_engagement_rate: number | null;
  ga4_alerts: Ga4AlertsState | null;
  sitemap_url: string | null;
  sitemap_status: string | null;
  sitemap_last_downloaded: string | null;
  organic_clicks: number | null;
  organic_impressions: number | null;
  top_organic_queries: TopOrganicQuery[] | null;
  google_ads_alerts: GoogleAdsAlertsState | null;
  communication_alerts: CommunicationAlertsState | null;
  lighthouse_performance: number | null;
  lighthouse_accessibility: number | null;
  lighthouse_seo: number | null;
  lighthouse_best_practices: number | null;
  lighthouse_audited_url: string | null;
  lighthouse_error: string | null;
  last_synced_at: string;
  sync_error: string | null;
};

const METRICS_CONFLICT_COLUMNS = "client_id,metric_month";

/**
 * Pulls Google Ads, GA4, GSC, PageSpeed (Lighthouse), and upserts `client_metrics` (service role).
 * Maps: cost_micros → ads_spend, conversions, clicks, impressions, derived ctr & average_cpc.
 * Upsert conflicts on (client_id, metric_month) — requires composite PK on that pair.
 *
 * @param opts.accessToken — When batching (e.g. Sync all), pass a single refreshed token to avoid N refresh calls.
 * @param opts.scope — When set, only that slice runs (Ads, GA4, GSC, or Lighthouse); other columns keep DB values.
 */
export async function syncClientMetrics(
  clientId: string,
  opts?: { accessToken?: string; scope?: MetricsSyncScope },
): Promise<SyncClientMetricsResult> {
  const supabase = getSupabaseAdmin();
  const { data: client, error: clientErr } = await supabase
    .from("clients")
    .select("google_ads_customer_id, ga4_property_id, search_console_url, website")
    .eq("id", clientId)
    .maybeSingle();

  if (clientErr) {
    console.error("SYNC CRASH:", clientErr);
    throw clientErr;
  }
  if (!client) {
    const err = new Error("Client not found.");
    console.error("SYNC CRASH:", err);
    throw err;
  }

  const access = opts?.accessToken ?? (await getGoogleAccessTokenFromRefresh());
  const metricMonth = monthStartDate();
  const scope = opts?.scope;
  const errors: string[] = [];

  const { data: existingRow, error: existingErr } = await supabase
    .from("client_metrics")
    .select(
      "ai_summary, ads_spend, ads_conversions, ads_clicks, ads_impressions, ads_ctr, ads_average_cpc, ads_search_impression_share, ads_search_rank_lost_impression_share, ads_search_budget_lost_impression_share, ads_search_abs_top_impression_share, ga4_sessions, ga4_key_events, ga4_engagement_rate, ga4_alerts, sitemap_url, sitemap_status, sitemap_last_downloaded, organic_clicks, organic_impressions, top_organic_queries, google_ads_alerts, communication_alerts, lighthouse_performance, lighthouse_accessibility, lighthouse_seo, lighthouse_best_practices, lighthouse_audited_url, lighthouse_error",
    )
    .eq("client_id", clientId)
    .eq("metric_month", metricMonth)
    .maybeSingle();

  if (existingErr) {
    console.error("SYNC CRASH:", existingErr);
    throw existingErr;
  }

  let ads_spend: number | null = null;
  let ads_conversions: number | null = null;
  let ads_clicks: number | null = null;
  let ads_impressions: number | null = null;
  let ads_ctr: number | null = null;
  let ads_average_cpc: number | null = null;
  let ads_search_impression_share: number | null = null;
  let ads_search_rank_lost_impression_share: number | null = null;
  let ads_search_budget_lost_impression_share: number | null = null;
  let ads_search_abs_top_impression_share: number | null = null;
  let google_ads_alerts: GoogleAdsAlertsState | null = parseGoogleAdsAlertsJson(
    existingRow?.google_ads_alerts as unknown,
  );
  let communication_alerts: CommunicationAlertsState | null = parseCommunicationAlertsJson(
    (existingRow as { communication_alerts?: unknown } | null)?.communication_alerts,
  );

  if (runAdsScope(scope)) {
  if (client.google_ads_customer_id?.trim()) {
    try {
      const ads = await fetchAdsMonthTotals({
        accessToken: access,
        customerId: client.google_ads_customer_id.trim(),
      });
      ads_spend = finiteOrNull(ads.spend);
      ads_conversions = finiteOrNull(ads.conversions);
      ads_clicks = Number.isFinite(ads.clicks) ? Math.round(ads.clicks) : null;
      ads_impressions = Number.isFinite(ads.impressions) ? Math.round(ads.impressions) : null;
      ads_ctr = finiteOrNull(ads.ctr);
      ads_average_cpc = finiteOrNull(ads.averageCpc);
      ads_search_impression_share = finiteOrNull(ads.searchImpressionShare);
      ads_search_rank_lost_impression_share = finiteOrNull(ads.searchRankLostImpressionShare);
      ads_search_budget_lost_impression_share = finiteOrNull(ads.searchBudgetLostImpressionShare);
      ads_search_abs_top_impression_share = finiteOrNull(ads.searchAbsTopImpressionShare);
      google_ads_alerts = await fetchGoogleAdsAlertsFromGaql({
        accessToken: access,
        customerId: client.google_ads_customer_id.trim(),
      });
      console.log("[metrics sync] Ads → Supabase column mapping:", {
        metric_month: metricMonth,
        ads_spend,
        ads_conversions,
        ads_clicks,
        ads_impressions,
        ads_ctr,
        ads_average_cpc,
        ads_search_impression_share,
        ads_search_rank_lost_impression_share,
        ads_search_budget_lost_impression_share,
        ads_search_abs_top_impression_share,
      });
    } catch (e) {
      console.error("SYNC CRASH:", e);
      errors.push(`Ads: ${e instanceof Error ? e.message : String(e)}`);
      ads_spend = existingRow?.ads_spend ?? null;
      ads_conversions = existingRow?.ads_conversions ?? null;
      ads_clicks = existingRow?.ads_clicks ?? null;
      ads_impressions = existingRow?.ads_impressions ?? null;
      ads_ctr = existingRow?.ads_ctr ?? null;
      ads_average_cpc = existingRow?.ads_average_cpc ?? null;
      ads_search_impression_share = existingRow?.ads_search_impression_share ?? null;
      ads_search_rank_lost_impression_share = existingRow?.ads_search_rank_lost_impression_share ?? null;
      ads_search_budget_lost_impression_share = existingRow?.ads_search_budget_lost_impression_share ?? null;
      ads_search_abs_top_impression_share = existingRow?.ads_search_abs_top_impression_share ?? null;
      google_ads_alerts = parseGoogleAdsAlertsJson(existingRow?.google_ads_alerts as unknown);
    }
  } else {
    errors.push("Ads: no Google Ads Customer ID saved for this client.");
    ads_spend = existingRow?.ads_spend ?? null;
    ads_conversions = existingRow?.ads_conversions ?? null;
    ads_clicks = existingRow?.ads_clicks ?? null;
    ads_impressions = existingRow?.ads_impressions ?? null;
    ads_ctr = existingRow?.ads_ctr ?? null;
    ads_average_cpc = existingRow?.ads_average_cpc ?? null;
    ads_search_impression_share = existingRow?.ads_search_impression_share ?? null;
    ads_search_rank_lost_impression_share = existingRow?.ads_search_rank_lost_impression_share ?? null;
    ads_search_budget_lost_impression_share = existingRow?.ads_search_budget_lost_impression_share ?? null;
    ads_search_abs_top_impression_share = existingRow?.ads_search_abs_top_impression_share ?? null;
    google_ads_alerts = null;
  }
  } else {
    ads_spend = existingRow?.ads_spend ?? null;
    ads_conversions = existingRow?.ads_conversions ?? null;
    ads_clicks = existingRow?.ads_clicks ?? null;
    ads_impressions = existingRow?.ads_impressions ?? null;
    ads_ctr = existingRow?.ads_ctr ?? null;
    ads_average_cpc = existingRow?.ads_average_cpc ?? null;
    ads_search_impression_share = existingRow?.ads_search_impression_share ?? null;
    ads_search_rank_lost_impression_share = existingRow?.ads_search_rank_lost_impression_share ?? null;
    ads_search_budget_lost_impression_share = existingRow?.ads_search_budget_lost_impression_share ?? null;
    ads_search_abs_top_impression_share = existingRow?.ads_search_abs_top_impression_share ?? null;
    google_ads_alerts = parseGoogleAdsAlertsJson(existingRow?.google_ads_alerts as unknown);
  }

  let ga4_sessions: number | null = null;
  let ga4_key_events: number | null = null;
  let ga4_engagement_rate: number | null = null;
  let ga4_alerts: Ga4AlertsState | null = parseGa4AlertsJson(existingRow?.ga4_alerts as unknown);

  if (runGa4Scope(scope)) {
  if (client.ga4_property_id?.trim()) {
    try {
      const ga = await fetchGa4SyncBundle({
        accessToken: access,
        propertyId: client.ga4_property_id.trim(),
      });
      ga4_sessions = ga.ga4_sessions != null ? finiteOrNull(ga.ga4_sessions) : null;
      ga4_key_events = ga.ga4_key_events != null ? finiteOrNull(ga.ga4_key_events) : null;
      ga4_engagement_rate =
        ga.ga4_engagement_rate != null && Number.isFinite(ga.ga4_engagement_rate)
          ? ga.ga4_engagement_rate
          : null;
      ga4_alerts = ga.ga4_alerts;
      console.log("[metrics sync] GA4 → Supabase:", {
        ga4_sessions,
        ga4_key_events,
        ga4_engagement_rate,
        ga4_alerts,
      });
      if (ga4_sessions == null && ga4_key_events == null && ga4_engagement_rate == null) {
        errors.push(
          "GA4: Data API returned no 30-day totals (check OAuth user has access to this property, property ID is numeric, and the property has recent traffic).",
        );
      }
    } catch (e) {
      console.error("SYNC CRASH:", e);
      errors.push(`GA4: ${e instanceof Error ? e.message : String(e)}`);
      ga4_sessions = existingRow?.ga4_sessions ?? null;
      ga4_key_events = existingRow?.ga4_key_events ?? null;
      ga4_engagement_rate =
        existingRow?.ga4_engagement_rate != null && Number.isFinite(Number(existingRow.ga4_engagement_rate))
          ? Number(existingRow.ga4_engagement_rate)
          : null;
      ga4_alerts = parseGa4AlertsJson(existingRow?.ga4_alerts as unknown);
    }
  } else {
    errors.push("GA4: no GA4 Property ID saved for this client.");
    ga4_sessions = existingRow?.ga4_sessions ?? null;
    ga4_key_events = existingRow?.ga4_key_events ?? null;
    ga4_engagement_rate =
      existingRow?.ga4_engagement_rate != null && Number.isFinite(Number(existingRow.ga4_engagement_rate))
        ? Number(existingRow.ga4_engagement_rate)
        : null;
    ga4_alerts = null;
  }
  } else {
    ga4_sessions =
      existingRow?.ga4_sessions != null && Number.isFinite(Number(existingRow.ga4_sessions))
        ? Math.round(Number(existingRow.ga4_sessions))
        : null;
    ga4_key_events =
      existingRow?.ga4_key_events != null && Number.isFinite(Number(existingRow.ga4_key_events))
        ? Math.round(Number(existingRow.ga4_key_events))
        : null;
    ga4_engagement_rate =
      existingRow?.ga4_engagement_rate != null && Number.isFinite(Number(existingRow.ga4_engagement_rate))
        ? Number(existingRow.ga4_engagement_rate)
        : null;
    ga4_alerts = parseGa4AlertsJson(existingRow?.ga4_alerts as unknown);
  }

  const prevMetrics = existingRow as Record<string, unknown> | null | undefined;
  let sitemap_url: string | null = (prevMetrics?.sitemap_url as string | null | undefined) ?? null;
  let sitemap_status: string | null = (prevMetrics?.sitemap_status as string | null | undefined) ?? null;
  let sitemap_last_downloaded: string | null =
    (prevMetrics?.sitemap_last_downloaded as string | null | undefined) ?? null;
  let organic_clicks: number | null =
    existingRow?.organic_clicks != null && Number.isFinite(Number(existingRow.organic_clicks))
      ? Math.round(Number(existingRow.organic_clicks))
      : null;
  let organic_impressions: number | null =
    existingRow?.organic_impressions != null && Number.isFinite(Number(existingRow.organic_impressions))
      ? Math.round(Number(existingRow.organic_impressions))
      : null;
  let top_organic_queries: TopOrganicQuery[] | null = Array.isArray(
    existingRow?.top_organic_queries as unknown,
  )
    ? (existingRow?.top_organic_queries as TopOrganicQuery[])
    : null;

  if (runGscScope(scope)) {
  if (client.search_console_url?.trim()) {
    const gscSite = client.search_console_url.trim();
    try {
      const organic = await fetchGscSearchAnalyticsSnapshot(access, gscSite);
      organic_clicks = organic.organic_clicks;
      organic_impressions = organic.organic_impressions;
      top_organic_queries = organic.top_organic_queries;
      console.log("[metrics sync] GSC Search Analytics:", organic);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (isSearchConsoleAccessDenied(e)) {
        console.warn(
          `[metrics sync] GSC Search Analytics: no API access for ${gscSite} (OAuth user needs Owner/Full user on this property, or fix URL).`,
        );
      } else {
        console.error("[metrics sync] GSC Search Analytics failed:", e);
      }
      errors.push(`GSC Search Analytics: ${msg}`);
      organic_clicks =
        existingRow?.organic_clicks != null && Number.isFinite(Number(existingRow.organic_clicks))
          ? Math.round(Number(existingRow.organic_clicks))
          : null;
      organic_impressions =
        existingRow?.organic_impressions != null &&
        Number.isFinite(Number(existingRow.organic_impressions))
          ? Math.round(Number(existingRow.organic_impressions))
          : null;
      top_organic_queries = Array.isArray(existingRow?.top_organic_queries as unknown)
        ? (existingRow?.top_organic_queries as TopOrganicQuery[])
        : null;
    }
    try {
      const gsc = await fetchGscSitemapSnapshot(access, gscSite);
      sitemap_url = gsc.sitemap_url;
      sitemap_status = gsc.sitemap_status;
      sitemap_last_downloaded = gsc.sitemap_last_downloaded;
      console.log("[metrics sync] GSC sitemap:", gsc);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (isSearchConsoleAccessDenied(e)) {
        console.warn(
          `[metrics sync] GSC sitemap: no API access for ${gscSite} (OAuth user needs Owner/Full user on this property, or fix URL).`,
        );
      } else {
        console.error("[metrics sync] GSC sitemap failed:", e);
      }
      errors.push(`GSC sitemap: ${msg}`);
    }
  } else {
    sitemap_url = null;
    sitemap_status = null;
    sitemap_last_downloaded = null;
    organic_clicks = null;
    organic_impressions = null;
    top_organic_queries = null;
  }
  } else {
    sitemap_url = existingRow?.sitemap_url != null ? String(existingRow.sitemap_url) : null;
    sitemap_status = existingRow?.sitemap_status != null ? String(existingRow.sitemap_status) : null;
    sitemap_last_downloaded =
      existingRow?.sitemap_last_downloaded != null ? String(existingRow.sitemap_last_downloaded) : null;
    organic_clicks =
      existingRow?.organic_clicks != null && Number.isFinite(Number(existingRow.organic_clicks))
        ? Math.round(Number(existingRow.organic_clicks))
        : null;
    organic_impressions =
      existingRow?.organic_impressions != null && Number.isFinite(Number(existingRow.organic_impressions))
        ? Math.round(Number(existingRow.organic_impressions))
        : null;
    top_organic_queries = Array.isArray(existingRow?.top_organic_queries as unknown)
      ? (existingRow?.top_organic_queries as TopOrganicQuery[])
      : null;
  }

  const prevM = existingRow as Record<string, unknown> | null | undefined;
  const lhInt = (key: string): number | null => {
    const v = prevM?.[key];
    if (v == null) return null;
    const n = Number(v);
    return Number.isFinite(n) ? Math.round(n) : null;
  };
  const prevLh = {
    performance: lhInt("lighthouse_performance"),
    accessibility: lhInt("lighthouse_accessibility"),
    seo: lhInt("lighthouse_seo"),
    bestPractices: lhInt("lighthouse_best_practices"),
    auditedUrl: typeof prevM?.lighthouse_audited_url === "string" ? prevM.lighthouse_audited_url : null,
    error: typeof prevM?.lighthouse_error === "string" ? prevM.lighthouse_error : null,
  };

  let lighthouse_performance = prevLh.performance;
  let lighthouse_accessibility = prevLh.accessibility;
  let lighthouse_seo = prevLh.seo;
  let lighthouse_best_practices = prevLh.bestPractices;
  let lighthouse_audited_url = prevLh.auditedUrl;
  let lighthouse_error = prevLh.error;

  if (runLighthouseScope(scope)) {
    const auditUrl = normalizeWebsiteForPageSpeed((client as { website?: string | null }).website);

    if (!auditUrl) {
      lighthouse_performance = null;
      lighthouse_accessibility = null;
      lighthouse_seo = null;
      lighthouse_best_practices = null;
      lighthouse_audited_url = null;
      lighthouse_error = null;
    } else {
      const psiKey = process.env.GOOGLE_PAGESPEED_API_KEY?.trim() ?? "";
      if (!psiKey) {
        errors.push("PageSpeed: GOOGLE_PAGESPEED_API_KEY not set — Lighthouse scores were not refreshed.");
      } else {
        try {
          const { scores, errorMessage } = await fetchPageSpeedLighthouseScores({
            url: auditUrl,
            apiKey: psiKey,
          });
          lighthouse_performance = scores.performance;
          lighthouse_accessibility = scores.accessibility;
          lighthouse_seo = scores.seo;
          lighthouse_best_practices = scores.bestPractices;
          lighthouse_audited_url = scores.finalUrl ?? auditUrl;
          lighthouse_error = errorMessage ? errorMessage.slice(0, 500) : null;
          if (errorMessage) {
            errors.push(`PageSpeed: ${errorMessage}`);
          }
          console.log("[metrics sync] PageSpeed → Supabase:", {
            lighthouse_performance,
            lighthouse_accessibility,
            lighthouse_seo,
            lighthouse_best_practices,
            lighthouse_audited_url,
          });
        } catch (e) {
          console.error("SYNC CRASH:", e);
          errors.push(`PageSpeed: ${e instanceof Error ? e.message : String(e)}`);
          lighthouse_performance = prevLh.performance;
          lighthouse_accessibility = prevLh.accessibility;
          lighthouse_seo = prevLh.seo;
          lighthouse_best_practices = prevLh.bestPractices;
          lighthouse_audited_url = prevLh.auditedUrl;
          lighthouse_error = prevLh.error;
        }
      }
    }
  }

  const last_synced_at = new Date().toISOString();
  const sync_error = errors.length ? errors.join(" | ") : null;

  const upsertPayload = {
    client_id: clientId,
    metric_month: metricMonth,
    ads_spend,
    ads_conversions,
    ads_clicks,
    ads_impressions,
    ads_ctr,
    ads_average_cpc,
    ads_search_impression_share,
    ads_search_rank_lost_impression_share,
    ads_search_budget_lost_impression_share,
    ads_search_abs_top_impression_share,
    ga4_sessions,
    ga4_key_events,
    ga4_engagement_rate,
    ga4_alerts,
    sitemap_url,
    sitemap_status,
    sitemap_last_downloaded,
    organic_clicks,
    organic_impressions,
    top_organic_queries,
    google_ads_alerts,
    communication_alerts,
    lighthouse_performance,
    lighthouse_accessibility,
    lighthouse_seo,
    lighthouse_best_practices,
    lighthouse_audited_url,
    lighthouse_error,
    ai_summary: existingRow?.ai_summary ?? null,
    last_synced_at,
    sync_error,
    updated_at: last_synced_at,
  };

  console.log("[metrics sync] Upsert payload:", upsertPayload);
  console.log("[metrics sync] Upsert onConflict:", METRICS_CONFLICT_COLUMNS);

  const { error: upsertErr, data: upsertRows } = await supabase
    .from("client_metrics")
    .upsert(upsertPayload, { onConflict: METRICS_CONFLICT_COLUMNS })
    .select(
      "client_id, metric_month, ads_spend, ads_conversions, ads_clicks, ads_impressions, ads_ctr, ads_average_cpc, ads_search_impression_share, ads_search_rank_lost_impression_share, ads_search_budget_lost_impression_share, ads_search_abs_top_impression_share",
    );

  if (upsertErr) {
    console.error("SYNC CRASH:", upsertErr);
    throw upsertErr;
  }

  console.log("[metrics sync] Upsert returned rows:", upsertRows);

  return {
    metric_month: metricMonth,
    ads_spend,
    ads_conversions,
    ads_clicks,
    ads_impressions,
    ads_ctr,
    ads_average_cpc,
    ads_search_impression_share,
    ads_search_rank_lost_impression_share,
    ads_search_budget_lost_impression_share,
    ads_search_abs_top_impression_share,
    ga4_sessions,
    ga4_key_events,
    ga4_engagement_rate,
    ga4_alerts,
    sitemap_url,
    sitemap_status,
    sitemap_last_downloaded,
    organic_clicks,
    organic_impressions,
    top_organic_queries,
    google_ads_alerts,
    communication_alerts,
    lighthouse_performance,
    lighthouse_accessibility,
    lighthouse_seo,
    lighthouse_best_practices,
    lighthouse_audited_url,
    lighthouse_error,
    last_synced_at,
    sync_error,
  };
}
