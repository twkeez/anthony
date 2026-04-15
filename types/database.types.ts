/**
 * App-level types for Supabase tables used by AgencyPulse.
 * Regenerate from Supabase CLI later if you want full generated types.
 */

import type { GoogleAdsAlertsState } from "@/lib/agency-hub/google-ads-account-status";
import type { CommunicationAlertsState } from "@/lib/agency-hub/communication-alerts";
import type { Ga4AlertsState } from "@/lib/agency-hub/ga4-analytics-status";

export type TaskStatus = "pending" | "completed";

export type ActiveServices = {
  seo: boolean;
  ppc: boolean;
  social: boolean;
  orm: boolean;
};

/** Stored in `client_metrics.top_organic_queries` (jsonb). */
export type TopOrganicQuery = {
  query: string;
  clicks: number;
  impressions?: number;
};

export type ClientGoalType = "Acquisition" | "Efficiency" | "Awareness" | "Retention";

export type ClientGoalStatus = "active" | "completed";
export type ReportStatus = "draft" | "published";

export type GbpReviewRow = {
  id: string;
  client_id: string;
  review_id: string;
  review_resource_name: string;
  reviewer_name: string;
  star_rating: number;
  comment: string | null;
  reply_text: string | null;
  is_replied: boolean;
  review_timestamp: string | null;
  last_sync_at: string;
};

export type ClientGoalRow = {
  id: string;
  client_id: string;
  goal_type: ClientGoalType;
  target_value: number;
  /** Maps to `client_metrics` via app whitelist (e.g. `conversions`, `ads_conversions`, `cpc`). */
  metric_target_column: string;
  intent_statement: string;
  evidence_keywords: string[];
  status: ClientGoalStatus;
  ai_analysis: string | null;
  created_at: string;
  updated_at: string;
};

export type ReportBlockType = "summary" | "ads" | "analytics" | "local" | "basecamp";

export type ReportBlock = {
  id: string;
  type: ReportBlockType;
  title: string;
  content: string;
};

export type ReportRow = {
  id: string;
  client_id: string;
  period_start: string;
  period_end: string;
  blocks: ReportBlock[];
  strategist_notes: string | null;
  public_id: string;
  status: ReportStatus;
  created_at: string;
  updated_at: string;
};

export type TaskRow = {
  id: string;
  client_id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  assigned_to: string | null;
  due_date: string | null;
  created_at: string;
  updated_at: string;
};

export type ClientMetricsRow = {
  client_id: string;
  metric_month: string;
  ads_spend: number | null;
  ads_conversions: number | null;
  ads_clicks: number | null;
  /** Sum of impressions for the metric month. */
  ads_impressions: number | null;
  /** Aggregate CTR as clicks/impressions (0–1). */
  ads_ctr: number | null;
  /** Average CPC in account currency. */
  ads_average_cpc: number | null;
  /** Search impression share (0–1). */
  ads_search_impression_share: number | null;
  /** Search rank lost impression share (0–1). */
  ads_search_rank_lost_impression_share: number | null;
  /** Search budget lost impression share (0–1). */
  ads_search_budget_lost_impression_share: number | null;
  /** Search absolute top-of-page impression share (0–1). */
  ads_search_abs_top_impression_share: number | null;
  ga4_sessions: number | null;
  ga4_key_events: number | null;
  /** GA4 `engagementRate` aggregate for trailing ~30 days (0–1). */
  ga4_engagement_rate: number | null;
  ga4_alerts: Ga4AlertsState | null;
  sitemap_url: string | null;
  sitemap_status: string | null;
  sitemap_last_downloaded: string | null;
  /** GSC Search Analytics, trailing ~30 days at sync. */
  organic_clicks: number | null;
  organic_impressions: number | null;
  top_organic_queries: TopOrganicQuery[] | null;
  google_ads_alerts: GoogleAdsAlertsState | null;
  /** Basecamp overdue task summary from communication sync. */
  communication_alerts: CommunicationAlertsState | null;
  /** Lighthouse / PageSpeed Insights category scores (0–100), mobile strategy at sync. */
  lighthouse_performance: number | null;
  lighthouse_accessibility: number | null;
  lighthouse_seo: number | null;
  lighthouse_best_practices: number | null;
  lighthouse_audited_url: string | null;
  lighthouse_error: string | null;
  ai_summary: string | null;
  last_synced_at: string | null;
  sync_error: string | null;
  updated_at: string;
};

export type TaskWithClient = TaskRow & {
  clients: { business_name: string; id: string } | null;
};

/** `public.staff` — roster, Basecamp matching, AI voice notes. */
export type StaffTableRow = {
  id: string;
  full_name: string;
  email: string;
  basecamp_id: string | null;
  basecamp_name_handle: string | null;
  writing_style_notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};
