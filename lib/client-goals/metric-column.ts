import type { ClientMetricsRow } from "@/types/database.types";

/** Whitelisted `client_metrics` columns addressable from `client_goals.metric_target_column`. */
export const METRIC_COLUMN_KEYS = [
  "ads_conversions",
  "ads_spend",
  "ads_clicks",
  "ads_impressions",
  "ads_ctr",
  "ads_average_cpc",
  "ads_search_impression_share",
  "ads_search_rank_lost_impression_share",
  "ads_search_budget_lost_impression_share",
  "ads_search_abs_top_impression_share",
  "ga4_sessions",
  "ga4_key_events",
  "ga4_engagement_rate",
  "organic_clicks",
  "organic_impressions",
] as const;

export type MetricColumnKey = (typeof METRIC_COLUMN_KEYS)[number];

const ALIASES: Record<string, MetricColumnKey> = {
  conversions: "ads_conversions",
  ads_conversions: "ads_conversions",
  cpc: "ads_average_cpc",
  ads_average_cpc: "ads_average_cpc",
  spend: "ads_spend",
  ads_spend: "ads_spend",
  clicks: "ads_clicks",
  ads_clicks: "ads_clicks",
  impressions: "ads_impressions",
  ads_impressions: "ads_impressions",
  ctr: "ads_ctr",
  ads_ctr: "ads_ctr",
  search_impression_share: "ads_search_impression_share",
  ads_search_impression_share: "ads_search_impression_share",
  rank_lost_impression_share: "ads_search_rank_lost_impression_share",
  ads_search_rank_lost_impression_share: "ads_search_rank_lost_impression_share",
  budget_lost_impression_share: "ads_search_budget_lost_impression_share",
  ads_search_budget_lost_impression_share: "ads_search_budget_lost_impression_share",
  abs_top_impression_share: "ads_search_abs_top_impression_share",
  ads_search_abs_top_impression_share: "ads_search_abs_top_impression_share",
  sessions: "ga4_sessions",
  ga4_sessions: "ga4_sessions",
  key_events: "ga4_key_events",
  ga4_key_events: "ga4_key_events",
  engagement_rate: "ga4_engagement_rate",
  ga4_engagement_rate: "ga4_engagement_rate",
  organic_clicks: "organic_clicks",
  organic_impressions: "organic_impressions",
};

/** Metrics where a lower raw value is better (target is a ceiling). */
const LOWER_IS_BETTER: ReadonlySet<MetricColumnKey> = new Set(["ads_average_cpc"]);

export function resolveMetricColumnKey(raw: string | null | undefined): MetricColumnKey | null {
  if (raw == null || raw.trim() === "") return null;
  const k = raw.trim().toLowerCase().replace(/\s+/g, "_");
  const mapped = ALIASES[k] ?? (ALIASES[raw.trim()] as MetricColumnKey | undefined);
  if (mapped) return mapped;
  if ((METRIC_COLUMN_KEYS as readonly string[]).includes(raw.trim())) {
    return raw.trim() as MetricColumnKey;
  }
  return null;
}

export function readMetricValue(metrics: ClientMetricsRow | null, key: MetricColumnKey): number | null {
  if (!metrics) return null;
  const v = metrics[key];
  if (v == null || !Number.isFinite(Number(v))) return null;
  return Number(v);
}

export function isLowerIsBetterMetric(key: MetricColumnKey): boolean {
  return LOWER_IS_BETTER.has(key);
}

/**
 * Progress 0–1 toward target: higher-is-better uses current/target;
 * lower-is-better (CPC) uses target/current when both positive.
 */
export function metricProgress01(
  key: MetricColumnKey,
  current: number | null,
  target: number,
): number | null {
  if (current == null || !Number.isFinite(current) || !Number.isFinite(target) || target <= 0) return null;
  if (isLowerIsBetterMetric(key)) {
    if (current <= 0) return null;
    return Math.min(1, target / current);
  }
  return Math.min(1, current / target);
}

export function formatMetricValue(key: MetricColumnKey, value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "—";
  if (key === "ads_average_cpc" || key === "ads_spend") {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(
      value,
    );
  }
  if (
    key === "ads_ctr" ||
    key === "ads_search_impression_share" ||
    key === "ads_search_rank_lost_impression_share" ||
    key === "ads_search_budget_lost_impression_share" ||
    key === "ads_search_abs_top_impression_share" ||
    key === "ga4_engagement_rate"
  ) {
    return `${(value * 100).toFixed(1)}%`;
  }
  return Math.round(value).toLocaleString();
}
