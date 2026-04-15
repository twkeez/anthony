import type { StrategyWorkspace } from "@/lib/client/strategy-workspace";
import type { ActiveServices } from "@/types/database.types";

export type ClientRow = {
  id: string;
  business_name: string;
  /** Optional stable key for bulk CSV upserts (legacy). */
  import_id: string | null;
  /** Optional CRM key; bulk import matches on this or case-insensitive client_name. */
  internal_crm_id: string | null;
  team_member: string | null;
  monthly_hours: number | null;
  service_tier: string | null;
  /** Legacy free-text services from CSV import */
  services: string | null;
  website: string | null;
  location: string | null;
  primary_contact: string | null;
  client_vibe_notes: string | null;
  account_group: string | null;
  email_domain: string | null;
  active_services: ActiveServices | null;
  google_ads_customer_id: string | null;
  ga4_property_id: string | null;
  monthly_ad_budget: number | null;
  target_cpa: number | null;
  search_console_url: string | null;
  tag_manager_id: string | null;
  gbp_location_id: string | null;
  basecamp_project_id: string | null;
  basecamp_email: string | null;
  /** Assigned strategist; Gemini uses `staff.writing_style_notes` when generating insights. */
  primary_strategist_id: string | null;
  /** Persisted Strategy / Roadmap tab payload (see migration `strategy_workspace`). */
  strategy_workspace: StrategyWorkspace;
  created_at: string;
  updated_at?: string | null;
};

export type HealthStatus = "green" | "yellow" | "red";

export type ThresholdRules = {
  flag_ads_spend_no_conversions: boolean;
  flag_zero_conversions_any_spend: boolean;
  min_performance_score: number;
};
