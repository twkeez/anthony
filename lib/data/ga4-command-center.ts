import { createSupabasePublicClient } from "@/lib/supabase/public";
import { normalizeActiveServices } from "@/lib/active-services";
import { parseGa4AlertsJson, type Ga4AlertsState } from "@/lib/agency-hub/ga4-analytics-status";
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

export type Ga4CommandCenterRow = {
  client: ClientRow;
  ga4_sessions: number | null;
  ga4_key_events: number | null;
  ga4_engagement_rate: number | null;
  ga4_alerts: Ga4AlertsState | null;
  last_synced_at: string | null;
  /** Populated when sync recorded Ads/GA4/GSC issues (pipe-separated). */
  sync_error: string | null;
};

export async function fetchGa4CommandCenterRows(): Promise<Ga4CommandCenterRow[]> {
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
    .select("client_id, ga4_sessions, ga4_key_events, ga4_engagement_rate, ga4_alerts, last_synced_at, sync_error")
    .eq("metric_month", month);

  if (mErr) throw mErr;

  const byClient = new Map<
    string,
    {
      ga4_sessions: number | null;
      ga4_key_events: number | null;
      ga4_engagement_rate: number | null;
      ga4_alerts: Ga4AlertsState | null;
      last_synced_at: string | null;
      sync_error: string | null;
    }
  >();
  for (const row of metricRows ?? []) {
    const r = row as Record<string, unknown>;
    const id = String(r.client_id);
    byClient.set(id, {
      ga4_sessions: r.ga4_sessions != null ? Number(r.ga4_sessions) : null,
      ga4_key_events: r.ga4_key_events != null ? Number(r.ga4_key_events) : null,
      ga4_engagement_rate:
        r.ga4_engagement_rate != null && Number.isFinite(Number(r.ga4_engagement_rate))
          ? Number(r.ga4_engagement_rate)
          : null,
      ga4_alerts: parseGa4AlertsJson(r.ga4_alerts),
      last_synced_at: r.last_synced_at != null ? String(r.last_synced_at) : null,
      sync_error: r.sync_error != null && String(r.sync_error).trim() !== "" ? String(r.sync_error).trim() : null,
    });
  }

  return clients.map((client) => {
    const m = byClient.get(client.id);
    return {
      client,
      ga4_sessions: m?.ga4_sessions ?? null,
      ga4_key_events: m?.ga4_key_events ?? null,
      ga4_engagement_rate: m?.ga4_engagement_rate ?? null,
      ga4_alerts: m?.ga4_alerts ?? null,
      last_synced_at: m?.last_synced_at ?? null,
      sync_error: m?.sync_error ?? null,
    };
  });
}
