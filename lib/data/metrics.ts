import { createSupabasePublicClient } from "@/lib/supabase/public";
import { parseGoogleAdsAlertsJson } from "@/lib/agency-hub/google-ads-account-status";
import { parseCommunicationAlertsJson } from "@/lib/agency-hub/communication-alerts";
import { parseGa4AlertsJson } from "@/lib/agency-hub/ga4-analytics-status";
import type { ClientMetricsRow, TopOrganicQuery } from "@/types/database.types";

function parseTopOrganicQueriesJson(raw: unknown): TopOrganicQuery[] | null {
  if (raw == null) return null;
  if (!Array.isArray(raw)) return null;
  const out: TopOrganicQuery[] = [];
  for (const el of raw) {
    if (!el || typeof el !== "object") continue;
    const o = el as Record<string, unknown>;
    const query = typeof o.query === "string" ? o.query.trim() : "";
    const c = o.clicks;
    const clicks =
      typeof c === "number" && Number.isFinite(c)
        ? Math.round(c)
        : Number.isFinite(Number(c))
          ? Math.round(Number(c))
          : NaN;
    if (!query || !Number.isFinite(clicks)) continue;
    const imp = o.impressions;
    const impressions =
      typeof imp === "number" && Number.isFinite(imp)
        ? Math.round(imp)
        : Number.isFinite(Number(imp))
          ? Math.round(Number(imp))
          : undefined;
    out.push({ query, clicks, ...(impressions !== undefined ? { impressions } : {}) });
  }
  return out.length ? out : null;
}

function toClientMetricsRow(raw: Record<string, unknown>): ClientMetricsRow {
  return {
    client_id: String(raw.client_id),
    metric_month: String(raw.metric_month),
    ads_spend: raw.ads_spend != null ? Number(raw.ads_spend) : null,
    ads_conversions: raw.ads_conversions != null ? Number(raw.ads_conversions) : null,
    ads_clicks: raw.ads_clicks != null ? Number(raw.ads_clicks) : null,
    ads_impressions: raw.ads_impressions != null ? Number(raw.ads_impressions) : null,
    ads_ctr: raw.ads_ctr != null ? Number(raw.ads_ctr) : null,
    ads_average_cpc: raw.ads_average_cpc != null ? Number(raw.ads_average_cpc) : null,
    ads_search_impression_share:
      raw.ads_search_impression_share != null ? Number(raw.ads_search_impression_share) : null,
    ads_search_rank_lost_impression_share:
      raw.ads_search_rank_lost_impression_share != null
        ? Number(raw.ads_search_rank_lost_impression_share)
        : null,
    ads_search_budget_lost_impression_share:
      raw.ads_search_budget_lost_impression_share != null
        ? Number(raw.ads_search_budget_lost_impression_share)
        : null,
    ads_search_abs_top_impression_share:
      raw.ads_search_abs_top_impression_share != null
        ? Number(raw.ads_search_abs_top_impression_share)
        : null,
    ga4_sessions: raw.ga4_sessions != null ? Number(raw.ga4_sessions) : null,
    ga4_key_events: raw.ga4_key_events != null ? Number(raw.ga4_key_events) : null,
    ga4_engagement_rate:
      raw.ga4_engagement_rate != null && Number.isFinite(Number(raw.ga4_engagement_rate))
        ? Number(raw.ga4_engagement_rate)
        : null,
    ga4_alerts: parseGa4AlertsJson(raw.ga4_alerts),
    sitemap_url: raw.sitemap_url != null ? String(raw.sitemap_url) : null,
    sitemap_status: raw.sitemap_status != null ? String(raw.sitemap_status) : null,
    sitemap_last_downloaded:
      raw.sitemap_last_downloaded != null ? String(raw.sitemap_last_downloaded) : null,
    organic_clicks: raw.organic_clicks != null ? Number(raw.organic_clicks) : null,
    organic_impressions: raw.organic_impressions != null ? Number(raw.organic_impressions) : null,
    top_organic_queries: parseTopOrganicQueriesJson(raw.top_organic_queries),
    google_ads_alerts: parseGoogleAdsAlertsJson(raw.google_ads_alerts),
    communication_alerts: parseCommunicationAlertsJson(raw.communication_alerts),
    lighthouse_performance:
      raw.lighthouse_performance != null && Number.isFinite(Number(raw.lighthouse_performance))
        ? Math.round(Number(raw.lighthouse_performance))
        : null,
    lighthouse_accessibility:
      raw.lighthouse_accessibility != null && Number.isFinite(Number(raw.lighthouse_accessibility))
        ? Math.round(Number(raw.lighthouse_accessibility))
        : null,
    lighthouse_seo:
      raw.lighthouse_seo != null && Number.isFinite(Number(raw.lighthouse_seo))
        ? Math.round(Number(raw.lighthouse_seo))
        : null,
    lighthouse_best_practices:
      raw.lighthouse_best_practices != null && Number.isFinite(Number(raw.lighthouse_best_practices))
        ? Math.round(Number(raw.lighthouse_best_practices))
        : null,
    lighthouse_audited_url: raw.lighthouse_audited_url != null ? String(raw.lighthouse_audited_url) : null,
    lighthouse_error: raw.lighthouse_error != null ? String(raw.lighthouse_error) : null,
    ai_summary: raw.ai_summary != null ? String(raw.ai_summary) : null,
    last_synced_at: raw.last_synced_at != null ? String(raw.last_synced_at) : null,
    sync_error: raw.sync_error != null ? String(raw.sync_error) : null,
    updated_at: String(raw.updated_at),
  };
}

export async function fetchClientMetrics(
  clientId: string,
): Promise<ClientMetricsRow | null> {
  const supabase = createSupabasePublicClient();
  const { data, error } = await supabase
    .from("client_metrics")
    .select("*")
    .eq("client_id", clientId)
    .order("metric_month", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return toClientMetricsRow(data as unknown as Record<string, unknown>);
}
