import { createSupabasePublicClient } from "@/lib/supabase/public";
import { normalizeActiveServices } from "@/lib/active-services";
import { fetchGlobalMinPerformanceScore } from "@/lib/data/app-thresholds";
import { normalizeWebsiteForPageSpeed } from "@/lib/google/pagespeed-lighthouse";
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

export type LighthouseHealth = "red" | "yellow" | "green" | "neutral";

export type LighthouseCommandCenterRow = {
  client: ClientRow;
  /** Raw `clients.website` (may lack scheme). */
  website: string | null;
  auditedUrl: string | null;
  performance: number | null;
  accessibility: number | null;
  seo: number | null;
  bestPractices: number | null;
  lighthouse_error: string | null;
  last_synced_at: string | null;
  sync_error: string | null;
};

export function lighthouseRowHealth(
  row: LighthouseCommandCenterRow,
  minPerformance: number,
): LighthouseHealth {
  const target = normalizeWebsiteForPageSpeed(row.website);
  if (!target) return "neutral";
  if (row.lighthouse_error) return "red";
  if (row.performance == null) return "yellow";
  if (row.performance < minPerformance) return "red";
  return "green";
}

export function lighthouseHealthSortRank(h: LighthouseHealth): number {
  if (h === "red") return 0;
  if (h === "yellow") return 1;
  if (h === "green") return 2;
  return 3;
}

export async function fetchLighthouseCommandCenterData(): Promise<{
  rows: LighthouseCommandCenterRow[];
  minPerformanceScore: number;
}> {
  const minPerformanceScore = await fetchGlobalMinPerformanceScore();
  const supabase = createSupabasePublicClient();
  const { data: clientRows, error: cErr } = await supabase
    .from("clients")
    .select("*")
    .order("business_name", { ascending: true });

  if (cErr) throw cErr;
  const clients = (clientRows ?? []).map((r) => mapClient(r as Record<string, unknown>));
  if (clients.length === 0) return { rows: [], minPerformanceScore };

  const month = metricMonthStartUtc();
  const { data: metricRows, error: mErr } = await supabase
    .from("client_metrics")
    .select(
      "client_id, lighthouse_performance, lighthouse_accessibility, lighthouse_seo, lighthouse_best_practices, lighthouse_audited_url, lighthouse_error, last_synced_at, sync_error",
    )
    .eq("metric_month", month);

  if (mErr) throw mErr;

  const byClient = new Map<
    string,
    {
      performance: number | null;
      accessibility: number | null;
      seo: number | null;
      bestPractices: number | null;
      auditedUrl: string | null;
      lighthouse_error: string | null;
      last_synced_at: string | null;
      sync_error: string | null;
    }
  >();

  for (const row of metricRows ?? []) {
    const r = row as Record<string, unknown>;
    const id = String(r.client_id);
    byClient.set(id, {
      performance:
        r.lighthouse_performance != null && Number.isFinite(Number(r.lighthouse_performance))
          ? Math.round(Number(r.lighthouse_performance))
          : null,
      accessibility:
        r.lighthouse_accessibility != null && Number.isFinite(Number(r.lighthouse_accessibility))
          ? Math.round(Number(r.lighthouse_accessibility))
          : null,
      seo: r.lighthouse_seo != null && Number.isFinite(Number(r.lighthouse_seo)) ? Math.round(Number(r.lighthouse_seo)) : null,
      bestPractices:
        r.lighthouse_best_practices != null && Number.isFinite(Number(r.lighthouse_best_practices))
          ? Math.round(Number(r.lighthouse_best_practices))
          : null,
      auditedUrl: r.lighthouse_audited_url != null ? String(r.lighthouse_audited_url) : null,
      lighthouse_error: r.lighthouse_error != null ? String(r.lighthouse_error) : null,
      last_synced_at: r.last_synced_at != null ? String(r.last_synced_at) : null,
      sync_error: r.sync_error != null ? String(r.sync_error) : null,
    });
  }

  const rows: LighthouseCommandCenterRow[] = clients.map((client) => {
    const m = byClient.get(client.id);
    return {
      client,
      website: client.website ?? null,
      auditedUrl: m?.auditedUrl ?? null,
      performance: m?.performance ?? null,
      accessibility: m?.accessibility ?? null,
      seo: m?.seo ?? null,
      bestPractices: m?.bestPractices ?? null,
      lighthouse_error: m?.lighthouse_error ?? null,
      last_synced_at: m?.last_synced_at ?? null,
      sync_error: m?.sync_error ?? null,
    };
  });

  return { rows, minPerformanceScore };
}
