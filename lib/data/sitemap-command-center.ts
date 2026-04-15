import { createSupabasePublicClient } from "@/lib/supabase/public";
import { normalizeActiveServices } from "@/lib/active-services";
import { parseStrategyWorkspace } from "@/lib/client/strategy-workspace";
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
    primary_strategist_id:
      raw.primary_strategist_id != null && String(raw.primary_strategist_id).trim() !== ""
        ? String(raw.primary_strategist_id).trim()
        : null,
    strategy_workspace: parseStrategyWorkspace(raw.strategy_workspace),
    updated_at: raw.updated_at != null ? String(raw.updated_at) : null,
    active_services: normalizeActiveServices(raw.active_services),
  };
}

export type SitemapCommandCenterRow = {
  client: ClientRow;
  sitemap_url: string | null;
  sitemap_status: string | null;
  sitemap_last_downloaded: string | null;
  organic_clicks: number | null;
  organic_impressions: number | null;
  last_synced_at: string | null;
};

export async function fetchSitemapCommandCenterRows(): Promise<SitemapCommandCenterRow[]> {
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
    .select(
      "client_id, sitemap_url, sitemap_status, sitemap_last_downloaded, organic_clicks, organic_impressions, last_synced_at",
    )
    .eq("metric_month", month);

  if (mErr) throw mErr;

  const byClient = new Map<
    string,
    {
      sitemap_url: string | null;
      sitemap_status: string | null;
      sitemap_last_downloaded: string | null;
      organic_clicks: number | null;
      organic_impressions: number | null;
      last_synced_at: string | null;
    }
  >();

  for (const row of metricRows ?? []) {
    const r = row as Record<string, unknown>;
    const id = String(r.client_id);
    byClient.set(id, {
      sitemap_url: r.sitemap_url != null ? String(r.sitemap_url) : null,
      sitemap_status: r.sitemap_status != null ? String(r.sitemap_status) : null,
      sitemap_last_downloaded: r.sitemap_last_downloaded != null ? String(r.sitemap_last_downloaded) : null,
      organic_clicks: r.organic_clicks != null ? Number(r.organic_clicks) : null,
      organic_impressions: r.organic_impressions != null ? Number(r.organic_impressions) : null,
      last_synced_at: r.last_synced_at != null ? String(r.last_synced_at) : null,
    });
  }

  return clients.map((client) => {
    const m = byClient.get(client.id);
    return {
      client,
      sitemap_url: m?.sitemap_url ?? null,
      sitemap_status: m?.sitemap_status ?? null,
      sitemap_last_downloaded: m?.sitemap_last_downloaded ?? null,
      organic_clicks: m?.organic_clicks ?? null,
      organic_impressions: m?.organic_impressions ?? null,
      last_synced_at: m?.last_synced_at ?? null,
    };
  });
}
