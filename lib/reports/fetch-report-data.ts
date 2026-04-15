import { parseCommunicationAlertsJson } from "@/lib/agency-hub/communication-alerts";
import { readMetricValue, resolveMetricColumnKey } from "@/lib/client-goals/metric-column";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { ClientGoalRow, ClientMetricsRow, GbpReviewRow } from "@/types/database.types";

export type ReportGoalInsight = {
  goal: ClientGoalRow;
  currentValue: number | null;
  metThisMonth: boolean;
};

export type ReportDataBundle = {
  ads: { spend: number; conversions: number; clicks: number; impressions: number };
  ga4: { sessions: number; keyEvents: number; avgEngagementRate: number | null };
  gbp: { reviewCount: number; lowStarUnreplied: number; repliedCount: number; latest: GbpReviewRow[] };
  basecamp: { unansweredCount: number; latestThreads: Array<{ subject: string; updatedAt: string; webUrl?: string }> };
  goals: ReportGoalInsight[];
};

function toNum(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function mapMetricsRow(raw: Record<string, unknown>): ClientMetricsRow {
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
      raw.ads_search_rank_lost_impression_share != null ? Number(raw.ads_search_rank_lost_impression_share) : null,
    ads_search_budget_lost_impression_share:
      raw.ads_search_budget_lost_impression_share != null ? Number(raw.ads_search_budget_lost_impression_share) : null,
    ads_search_abs_top_impression_share:
      raw.ads_search_abs_top_impression_share != null ? Number(raw.ads_search_abs_top_impression_share) : null,
    ga4_sessions: raw.ga4_sessions != null ? Number(raw.ga4_sessions) : null,
    ga4_key_events: raw.ga4_key_events != null ? Number(raw.ga4_key_events) : null,
    ga4_engagement_rate: raw.ga4_engagement_rate != null ? Number(raw.ga4_engagement_rate) : null,
    ga4_alerts: null,
    sitemap_url: raw.sitemap_url != null ? String(raw.sitemap_url) : null,
    sitemap_status: raw.sitemap_status != null ? String(raw.sitemap_status) : null,
    sitemap_last_downloaded: raw.sitemap_last_downloaded != null ? String(raw.sitemap_last_downloaded) : null,
    organic_clicks: raw.organic_clicks != null ? Number(raw.organic_clicks) : null,
    organic_impressions: raw.organic_impressions != null ? Number(raw.organic_impressions) : null,
    top_organic_queries: null,
    google_ads_alerts: null,
    communication_alerts: parseCommunicationAlertsJson(raw.communication_alerts),
    lighthouse_performance: null,
    lighthouse_accessibility: null,
    lighthouse_seo: null,
    lighthouse_best_practices: null,
    lighthouse_audited_url: null,
    lighthouse_error: null,
    ai_summary: raw.ai_summary != null ? String(raw.ai_summary) : null,
    last_synced_at: raw.last_synced_at != null ? String(raw.last_synced_at) : null,
    sync_error: raw.sync_error != null ? String(raw.sync_error) : null,
    updated_at: String(raw.updated_at ?? ""),
  };
}

export async function fetchReportData(clientId: string, periodStart: string, periodEnd: string): Promise<ReportDataBundle> {
  const supabase = getSupabaseAdmin();

  const [{ data: metricsRows }, { data: goalsRows }, { data: reviewsRows }] = await Promise.all([
    supabase
      .from("client_metrics")
      .select("*")
      .eq("client_id", clientId)
      .gte("metric_month", periodStart)
      .lte("metric_month", periodEnd)
      .order("metric_month", { ascending: true }),
    supabase.from("client_goals").select("*").eq("client_id", clientId),
    supabase
      .from("gbp_reviews")
      .select("*")
      .eq("client_id", clientId)
      .gte("review_timestamp", `${periodStart}T00:00:00.000Z`)
      .lte("review_timestamp", `${periodEnd}T23:59:59.999Z`)
      .order("review_timestamp", { ascending: false }),
  ]);

  const metrics = (metricsRows ?? []).map((r) => mapMetricsRow(r as Record<string, unknown>));
  const latestMetrics = metrics.length > 0 ? metrics[metrics.length - 1] : null;

  const ads = metrics.reduce(
    (acc, m) => ({
      spend: acc.spend + toNum(m.ads_spend),
      conversions: acc.conversions + toNum(m.ads_conversions),
      clicks: acc.clicks + toNum(m.ads_clicks),
      impressions: acc.impressions + toNum(m.ads_impressions),
    }),
    { spend: 0, conversions: 0, clicks: 0, impressions: 0 },
  );

  const ga4 = metrics.reduce(
    (acc, m) => ({
      sessions: acc.sessions + toNum(m.ga4_sessions),
      keyEvents: acc.keyEvents + toNum(m.ga4_key_events),
      rates: m.ga4_engagement_rate != null && Number.isFinite(m.ga4_engagement_rate) ? [...acc.rates, m.ga4_engagement_rate] : acc.rates,
    }),
    { sessions: 0, keyEvents: 0, rates: [] as number[] },
  );

  const reviews = (reviewsRows ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    return {
      id: String(r.id),
      client_id: String(r.client_id),
      review_id: String(r.review_id ?? ""),
      review_resource_name: String(r.review_resource_name ?? ""),
      reviewer_name: String(r.reviewer_name ?? ""),
      star_rating: Math.round(Number(r.star_rating)),
      comment: r.comment != null ? String(r.comment) : null,
      reply_text: r.reply_text != null ? String(r.reply_text) : null,
      is_replied: Boolean(r.is_replied),
      review_timestamp: r.review_timestamp != null ? String(r.review_timestamp) : null,
      last_sync_at: String(r.last_sync_at ?? ""),
    } satisfies GbpReviewRow;
  });

  const basecampThreads: Array<{ subject: string; updatedAt: string; webUrl?: string }> = [];
  for (const m of metrics) {
    const comm = parseCommunicationAlertsJson(m.communication_alerts);
    for (const t of comm?.messageBoardActivity ?? []) {
      if (!t.updatedAt || !t.subject?.trim()) continue;
      const d = t.updatedAt.slice(0, 10);
      if (d < periodStart || d > periodEnd) continue;
      basecampThreads.push({ subject: t.subject.trim(), updatedAt: t.updatedAt, ...(t.webUrl ? { webUrl: t.webUrl } : {}) });
    }
  }
  basecampThreads.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  const goalsRaw = (goalsRows ?? []) as Record<string, unknown>[];
  const goals: ReportGoalInsight[] = goalsRaw.map((g) => {
    const goal: ClientGoalRow = {
      id: String(g.id),
      client_id: String(g.client_id),
      goal_type: g.goal_type as ClientGoalRow["goal_type"],
      target_value: Number(g.target_value ?? 0),
      metric_target_column: String(g.metric_target_column ?? ""),
      intent_statement: String(g.intent_statement ?? ""),
      evidence_keywords: Array.isArray(g.evidence_keywords) ? g.evidence_keywords.map((x) => String(x)) : [],
      status: (g.status as ClientGoalRow["status"]) ?? "active",
      ai_analysis: g.ai_analysis != null ? String(g.ai_analysis) : null,
      created_at: String(g.created_at ?? ""),
      updated_at: String(g.updated_at ?? ""),
    };
    const key = resolveMetricColumnKey(goal.metric_target_column);
    const currentValue = key ? readMetricValue(latestMetrics, key) : null;
    const metThisMonth =
      currentValue != null && Number.isFinite(currentValue) && Number.isFinite(goal.target_value)
        ? currentValue >= goal.target_value
        : false;
    return { goal, currentValue, metThisMonth };
  });

  return {
    ads,
    ga4: {
      sessions: ga4.sessions,
      keyEvents: ga4.keyEvents,
      avgEngagementRate: ga4.rates.length > 0 ? ga4.rates.reduce((a, b) => a + b, 0) / ga4.rates.length : null,
    },
    gbp: {
      reviewCount: reviews.length,
      lowStarUnreplied: reviews.filter((r) => r.star_rating <= 3 && !r.is_replied).length,
      repliedCount: reviews.filter((r) => r.is_replied).length,
      latest: reviews.slice(0, 5),
    },
    basecamp: {
      unansweredCount: metrics.reduce(
        (acc, m) => acc + (parseCommunicationAlertsJson(m.communication_alerts)?.unansweredClientThreads?.length ?? 0),
        0,
      ),
      latestThreads: basecampThreads.slice(0, 10),
    },
    goals,
  };
}
