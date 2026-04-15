import type { CommunicationMessageBoardTriageRow } from "@/lib/communication/message-board-triage-types";
import { isWaitingOnClientTriageActive } from "@/lib/communication/message-board-triage-filter";
import {
  daysSinceLastContactFromIso,
  parseCommunicationAlertsJson,
  type CommunicationAlertsState,
} from "@/lib/agency-hub/communication-alerts";
import { normalizeActiveServices } from "@/lib/active-services";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createSupabasePublicClient } from "@/lib/supabase/public";
import type { ClientRow } from "@/types/client";
import type { GbpReviewRow } from "@/types/database.types";

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
    updated_at: raw.updated_at != null ? String(raw.updated_at) : null,
    active_services: normalizeActiveServices(raw.active_services),
  };
}

/** Traffic light for the communication command center (message board + triage). */
export type CommunicationHealth = "red" | "yellow" | "green" | "neutral";

function contactDaysForRow(comm: CommunicationAlertsState | null): number | null {
  if (!comm) return null;
  if (comm.daysSinceLastContact != null && Number.isFinite(comm.daysSinceLastContact)) {
    return Math.round(comm.daysSinceLastContact);
  }
  if (comm.lastMessage?.updatedAt) {
    return daysSinceLastContactFromIso(comm.lastMessage.updatedAt);
  }
  return null;
}

/**
 * Command center rules:
 * - Red: last board post from client / external and likely waiting (not triage-suppressed), **or** a 1–3★ Google
 *   review without a reply (`gbpNeedsUrgentReply`).
 * - Green: last post from agency/internal and within the last 14 days.
 * - Yellow: everything else (including unknown author, no messages, internal older than 14 days, 14+ days silence).
 */
export function communicationRowHealth(
  comm: CommunicationAlertsState | null,
  hasBasecampProject: boolean,
  clientId: string,
  triage: readonly CommunicationMessageBoardTriageRow[] = [],
  gbpNeedsUrgentReply = false,
): CommunicationHealth {
  if (gbpNeedsUrgentReply) return "red";
  if (!hasBasecampProject) return "neutral";
  if (!comm?.syncedAt) return "neutral";

  const days = contactDaysForRow(comm);
  const lastUpdated = comm.lastMessage?.updatedAt?.trim() ?? "";

  const suppressed = isWaitingOnClientTriageActive(clientId, lastUpdated || null, triage, days, Date.now());

  const clientWasLast =
    comm.is_internal_author === false || comm.waitingForResponse === true;

  if (clientWasLast && lastUpdated !== "" && !suppressed) {
    return "red";
  }

  if (comm.is_internal_author === true && days != null && days <= 14) {
    return "green";
  }

  return "yellow";
}

export function lastBoardActivityMs(comm: CommunicationAlertsState | null): number {
  const iso = comm?.lastMessage?.updatedAt ?? comm?.messageBoardActivity?.[0]?.updatedAt;
  if (!iso) return 0;
  const t = new Date(String(iso).trim()).getTime();
  return Number.isFinite(t) ? t : 0;
}

/** Sort clients: red → yellow → green → neutral, then newest board activity first. */
export function sortCommunicationCommandCenterRows(
  rows: CommunicationCommandCenterRow[],
  triage: readonly CommunicationMessageBoardTriageRow[],
): CommunicationCommandCenterRow[] {
  const out = [...rows];
  out.sort((a, b) => {
    const ha = communicationRowHealth(
      a.communication,
      a.hasBasecampProject,
      a.client.id,
      triage,
      a.gbpNeedsUrgentReply,
    );
    const hb = communicationRowHealth(
      b.communication,
      b.hasBasecampProject,
      b.client.id,
      triage,
      b.gbpNeedsUrgentReply,
    );
    const ra = communicationHealthSortRank(ha);
    const rb = communicationHealthSortRank(hb);
    if (ra !== rb) return ra - rb;
    return lastBoardActivityMs(b.communication) - lastBoardActivityMs(a.communication);
  });
  return out;
}

async function fetchTriageForClientIds(clientIds: string[]): Promise<CommunicationMessageBoardTriageRow[]> {
  if (clientIds.length === 0) return [];
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("communication_message_board_triage")
      .select("*")
      .in("client_id", clientIds);
    if (error) throw error;
    return (data ?? []) as CommunicationMessageBoardTriageRow[];
  } catch {
    return [];
  }
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
  gbpNeedsUrgentReply: boolean;
  gbpReviews: GbpReviewRow[];
};

export async function fetchCommunicationCommandCenterData(): Promise<{
  rows: CommunicationCommandCenterRow[];
  triage: CommunicationMessageBoardTriageRow[];
}> {
  const supabase = createSupabasePublicClient();
  const { data: clientRows, error: cErr } = await supabase
    .from("clients")
    .select("*")
    .order("business_name", { ascending: true });

  if (cErr) throw cErr;
  const clients = (clientRows ?? []).map((r) => mapClient(r as Record<string, unknown>));
  if (clients.length === 0) return { rows: [], triage: [] };

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

  let gbpReviewsAll: GbpReviewRow[] = [];
  try {
    const supabaseGbp = createSupabasePublicClient();
    const { data: gbpData, error: gbpErr } = await supabaseGbp
      .from("gbp_reviews")
      .select("*")
      .in(
        "client_id",
        clients.map((c) => c.id),
      )
      .order("review_timestamp", { ascending: false });
    if (gbpErr) {
      if (!/gbp_reviews|schema cache|does not exist/i.test(gbpErr.message ?? "")) throw gbpErr;
    } else {
      gbpReviewsAll = (gbpData ?? []).map((row) => {
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
    }
  } catch {
    gbpReviewsAll = [];
  }

  const gbpGrouped = new Map<string, GbpReviewRow[]>();
  const criticalGbp = new Set<string>();
  for (const r of gbpReviewsAll) {
    if (r.star_rating >= 1 && r.star_rating <= 3 && !r.is_replied) {
      criticalGbp.add(r.client_id);
    }
    const list = gbpGrouped.get(r.client_id) ?? [];
    list.push(r);
    gbpGrouped.set(r.client_id, list);
  }
  const byClientGbp = new Map<string, GbpReviewRow[]>();
  for (const [cid, list] of gbpGrouped) {
    list.sort((a, b) => {
      const ta = a.review_timestamp ?? "";
      const tb = b.review_timestamp ?? "";
      return tb.localeCompare(ta);
    });
    byClientGbp.set(cid, list.slice(0, 3));
  }

  const rows: CommunicationCommandCenterRow[] = clients.map((client) => {
    const hasBasecampProject = Boolean((client.basecamp_project_id ?? "").trim());
    const communication = byClient.get(client.id) ?? null;
    const gbpReviews = byClientGbp.get(client.id) ?? [];
    const gbpNeedsUrgentReply = criticalGbp.has(client.id);
    return { client, communication, hasBasecampProject, gbpNeedsUrgentReply, gbpReviews };
  });

  const triage = await fetchTriageForClientIds(clients.map((c) => c.id));
  const sorted = sortCommunicationCommandCenterRows(rows, triage);

  return { rows: sorted, triage };
}
