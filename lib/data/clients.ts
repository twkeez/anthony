import { cache } from "react";

import type { ClientWithSyncSnapshot } from "@/lib/dashboard/client-status";
import { createSupabasePublicClient } from "@/lib/supabase/public";
import { normalizeActiveServices } from "@/lib/active-services";
import type { ClientRow } from "@/types/client";

function metricMonthStartUtc(d = new Date()) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString().slice(0, 10);
}

function mapClient(raw: Record<string, unknown>): ClientRow {
  const r = raw as Record<string, unknown>;
  return {
    ...(raw as unknown as ClientRow),
    import_id: r.import_id != null ? String(r.import_id) : null,
    internal_crm_id:
      r.internal_crm_id != null && String(r.internal_crm_id).trim() !== ""
        ? String(r.internal_crm_id).trim()
        : null,
    monthly_ad_budget: r.monthly_ad_budget != null ? Number(r.monthly_ad_budget) : null,
    target_cpa: r.target_cpa != null ? Number(r.target_cpa) : null,
    search_console_url: r.search_console_url != null ? String(r.search_console_url) : null,
    tag_manager_id: r.tag_manager_id != null ? String(r.tag_manager_id) : null,
    gbp_location_id: r.gbp_location_id != null ? String(r.gbp_location_id) : null,
    basecamp_project_id: r.basecamp_project_id != null ? String(r.basecamp_project_id) : null,
    basecamp_email: r.basecamp_email != null ? String(r.basecamp_email) : null,
    primary_strategist_id:
      r.primary_strategist_id != null && String(r.primary_strategist_id).trim() !== ""
        ? String(r.primary_strategist_id).trim()
        : null,
    updated_at: r.updated_at != null ? String(r.updated_at) : null,
    active_services: normalizeActiveServices(raw.active_services),
  };
}

export async function fetchAllClients(): Promise<ClientRow[]> {
  const supabase = createSupabasePublicClient();
  const { data, error } = await supabase
    .from("clients")
    .select("*")
    .order("business_name", { ascending: true });

  if (error) throw error;
  return (data ?? []).map((row) => mapClient(row as Record<string, unknown>));
}

/** Clients plus current-month `client_metrics` sync snapshot for dashboard traffic lights. */
export async function fetchDashboardClients(): Promise<ClientWithSyncSnapshot[]> {
  const clients = await fetchAllClients();
  if (clients.length === 0) return [];

  const supabase = createSupabasePublicClient();
  const month = metricMonthStartUtc();
  const ids = clients.map((c) => c.id);

  const { data: metrics, error } = await supabase
    .from("client_metrics")
    .select("client_id, sync_error, last_synced_at")
    .eq("metric_month", month)
    .in("client_id", ids);

  if (error) {
    console.error("[fetchDashboardClients] client_metrics:", error.message);
    return clients.map((c) => ({ ...c, sync_error: null, last_synced_at: null }));
  }

  const byId = new Map<string, { sync_error: string | null; last_synced_at: string | null }>();
  for (const row of metrics ?? []) {
    const r = row as { client_id: string; sync_error: string | null; last_synced_at: string | null };
    byId.set(r.client_id, {
      sync_error: r.sync_error != null && String(r.sync_error).trim() !== "" ? String(r.sync_error) : null,
      last_synced_at: r.last_synced_at != null ? String(r.last_synced_at) : null,
    });
  }

  return clients.map((c) => {
    const m = byId.get(c.id);
    return {
      ...c,
      sync_error: m?.sync_error ?? null,
      last_synced_at: m?.last_synced_at ?? null,
    };
  });
}

export const fetchClientById = cache(async function fetchClientById(id: string): Promise<ClientRow | null> {
  const supabase = createSupabasePublicClient();
  const { data, error } = await supabase.from("clients").select("*").eq("id", id).maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return mapClient(data as Record<string, unknown>);
});
