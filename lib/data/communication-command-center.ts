import { createSupabasePublicClient } from "@/lib/supabase/public";
import {
  daysSinceLastContactFromIso,
  parseCommunicationAlertsJson,
  type CommunicationAlertsState,
} from "@/lib/agency-hub/communication-alerts";
import { normalizeActiveServices } from "@/lib/active-services";
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

/** Traffic light for Basecamp communication: reply needed, staleness, overdue todos. */
export type CommunicationHealth = "red" | "yellow" | "green" | "neutral";

/**
 * Red: needs reply, 15+ days since last board activity, or severe overdue todos.
 * Yellow: moderate overdue todos or 7–14 days since last contact.
 * Green: in good standing.
 * Neutral: no mapped Basecamp project or no communication snapshot yet.
 */
export function communicationRowHealth(
  comm: CommunicationAlertsState | null,
  hasBasecampProject: boolean,
): CommunicationHealth {
  if (!hasBasecampProject) return "neutral";
  if (!comm?.syncedAt) return "neutral";

  const days =
    comm.daysSinceLastContact ??
    (comm.lastMessage?.updatedAt ? daysSinceLastContactFromIso(comm.lastMessage.updatedAt) : null);

  if (comm.waitingForResponse === true) return "red";
  if (days != null && days >= 15) return "red";
  if (comm.status === "red") return "red";

  if (comm.status === "yellow") return "yellow";
  if (days != null && days >= 7) return "yellow";

  return "green";
}

export function communicationHealthSortRank(h: CommunicationHealth): number {
  if (h === "red") return 0;
  if (h === "yellow") return 1;
  if (h === "green") return 2;
  return 3;
}

export type CommunicationCommandCenterRow = {
  client: ClientRow;
  communication: CommunicationAlertsState | null;
  hasBasecampProject: boolean;
};

export async function fetchCommunicationCommandCenterData(): Promise<{
  rows: CommunicationCommandCenterRow[];
}> {
  const supabase = createSupabasePublicClient();
  const { data: clientRows, error: cErr } = await supabase
    .from("clients")
    .select("*")
    .order("business_name", { ascending: true });

  if (cErr) throw cErr;
  const clients = (clientRows ?? []).map((r) => mapClient(r as Record<string, unknown>));
  if (clients.length === 0) return { rows: [] };

  const month = metricMonthStartUtc();
  const { data: metricRows, error: mErr } = await supabase
    .from("client_metrics")
    .select("client_id, communication_alerts")
    .eq("metric_month", month);

  if (mErr) throw mErr;

  const byClient = new Map<string, CommunicationAlertsState | null>();
  for (const row of metricRows ?? []) {
    const r = row as { client_id: string; communication_alerts: unknown };
    byClient.set(String(r.client_id), parseCommunicationAlertsJson(r.communication_alerts));
  }

  const rows: CommunicationCommandCenterRow[] = clients.map((client) => {
    const hasBasecampProject = Boolean((client.basecamp_project_id ?? "").trim());
    const communication = byClient.get(client.id) ?? null;
    return { client, communication, hasBasecampProject };
  });

  return { rows };
}
