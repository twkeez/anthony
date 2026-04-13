import { createSupabasePublicClient } from "@/lib/supabase/public";
import { normalizeActiveServices } from "@/lib/active-services";
import {
  type GoogleAdsAlertsState,
  parseGoogleAdsAlertsJson,
} from "@/lib/agency-hub/google-ads-account-status";
import type { ClientRow } from "@/types/client";

function metricMonthStartUtc(d = new Date()) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString().slice(0, 10);
}

function mapClient(raw: Record<string, unknown>): ClientRow {
  return {
    ...(raw as unknown as ClientRow),
    import_id: raw.import_id != null ? String(raw.import_id) : null,
    internal_crm_id:
      raw.internal_crm_id != null && String(raw.internal_crm_id).trim() !== ""
        ? String(raw.internal_crm_id).trim()
        : null,
    monthly_ad_budget: raw.monthly_ad_budget != null ? Number(raw.monthly_ad_budget) : null,
    target_cpa: raw.target_cpa != null ? Number(raw.target_cpa) : null,
    search_console_url: raw.search_console_url != null ? String(raw.search_console_url) : null,
    tag_manager_id: raw.tag_manager_id != null ? String(raw.tag_manager_id) : null,
    gbp_location_id: raw.gbp_location_id != null ? String(raw.gbp_location_id) : null,
    basecamp_project_id: raw.basecamp_project_id != null ? String(raw.basecamp_project_id) : null,
    basecamp_email: raw.basecamp_email != null ? String(raw.basecamp_email) : null,
    updated_at: raw.updated_at != null ? String(raw.updated_at) : null,
    active_services: normalizeActiveServices(raw.active_services),
  };
}

export type AdsCommandCenterRow = {
  client: ClientRow;
  ads_spend: number | null;
  ads_conversions: number | null;
  google_ads_alerts: GoogleAdsAlertsState | null;
  last_synced_at: string | null;
};

export async function fetchAdsCommandCenterRows(): Promise<AdsCommandCenterRow[]> {
  const supabase = createSupabasePublicClient();
  const { data: clientRows, error: cErr } = await supabase
    .from("clients")
    .select("*")
    .order("business_name", { ascending: true });

  if (cErr) throw cErr;
  const clients = (clientRows ?? []).map((r) => mapClient(r as Record<string, unknown>));
  if (clients.length === 0) return [];

  const month = metricMonthStartUtc();
  const { data: metricRows, error: mErr } = await supabase
    .from("client_metrics")
    .select("client_id, ads_spend, ads_conversions, google_ads_alerts, last_synced_at")
    .eq("metric_month", month);

  if (mErr) throw mErr;

  const byClient = new Map<
    string,
    {
      ads_spend: number | null;
      ads_conversions: number | null;
      google_ads_alerts: GoogleAdsAlertsState | null;
      last_synced_at: string | null;
    }
  >();
  for (const row of metricRows ?? []) {
    const r = row as Record<string, unknown>;
    const id = String(r.client_id);
    byClient.set(id, {
      ads_spend: r.ads_spend != null ? Number(r.ads_spend) : null,
      ads_conversions: r.ads_conversions != null ? Number(r.ads_conversions) : null,
      google_ads_alerts: parseGoogleAdsAlertsJson(r.google_ads_alerts),
      last_synced_at: r.last_synced_at != null ? String(r.last_synced_at) : null,
    });
  }

  return clients.map((client) => {
    const m = byClient.get(client.id);
    return {
      client,
      ads_spend: m?.ads_spend ?? null,
      ads_conversions: m?.ads_conversions ?? null,
      google_ads_alerts: m?.google_ads_alerts ?? null,
      last_synced_at: m?.last_synced_at ?? null,
    };
  });
}
