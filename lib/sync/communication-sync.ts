import {
  computeCommunicationResponsiveness,
  type CommunicationAlertsState,
  type CommunicationLastMessageSnapshot,
  type CommunicationTodoItem,
} from "@/lib/agency-hub/communication-alerts";
import {
  collectOverdueTodosFromProjectTodoLists,
  fetchProjectLatestMessageBoardTopic,
  fetchProjectTodoLists,
  type NormalizedOverdueTodo,
} from "@/lib/basecamp/basecamp-api";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export function currentMetricMonthStart(d = new Date()) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString().slice(0, 10);
}

function monthStartDate(d = new Date()) {
  return currentMetricMonthStart(d);
}

/** Parallel Basecamp project fetches per tick (balance speed vs rate limits). */
const BASECAMP_PROJECT_FETCH_CONCURRENCY = 5;

/**
 * When `last_updater.email_address` is present, internal senders are detected by `@beyond` domain
 * (see `isBeyondInternalEmail`). Otherwise agency staff are matched via comma-separated
 * `AGENCY_TEAM_NAMES` / `AGENCY_TEAM_IDS` in `.env.local`.
 */
function parseCommaSeparatedEnv(raw: string | undefined): string[] {
  if (raw == null || raw.trim() === "") return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s !== "");
}

const AGENCY_TEAM_NAMES: string[] = [
  // e.g. "Alex Smith", "Jamie Lee" — case-insensitive match to Basecamp `last_updater.name`
  ...parseCommaSeparatedEnv(process.env.AGENCY_TEAM_NAMES),
];

const AGENCY_TEAM_IDS: string[] = [
  // e.g. "149087659" — string form of Basecamp `last_updater.id`
  ...parseCommaSeparatedEnv(process.env.AGENCY_TEAM_IDS),
];

function buildCommunicationAlerts(
  todos: NormalizedOverdueTodo[],
  lastMessage: CommunicationLastMessageSnapshot | null,
): CommunicationAlertsState {
  const syncedAt = new Date().toISOString();
  const {
    waitingForResponse,
    daysSinceLastContact,
    lastMessageAuthor,
    last_internal_reply_at,
    is_internal_author,
  } = computeCommunicationResponsiveness(lastMessage, AGENCY_TEAM_NAMES, AGENCY_TEAM_IDS);

  const overdueCount = todos.length;
  if (overdueCount === 0) {
    return {
      overdueCount: 0,
      mostOverdueDays: 0,
      status: "green",
      tasks: [],
      syncedAt,
      lastMessage,
      waitingForResponse,
      daysSinceLastContact,
      lastMessageAuthor,
      last_internal_reply_at,
      is_internal_author,
    };
  }

  const mostOverdueDays = Math.max(...todos.map((t) => t.daysLate));
  const hasOverWeek = todos.some((t) => t.group !== "under_a_week_late");
  const status: CommunicationAlertsState["status"] = hasOverWeek ? "red" : "yellow";

  const tasks: CommunicationTodoItem[] = todos.map((t) => ({
    name: t.title,
    dueOn: t.dueOn,
    daysLate: t.daysLate,
    ...(t.projectName ? { projectName: t.projectName } : {}),
  }));

  return {
    overdueCount,
    mostOverdueDays,
    status,
    tasks,
    syncedAt,
    lastMessage,
    waitingForResponse,
    daysSinceLastContact,
    lastMessageAuthor,
    last_internal_reply_at,
    is_internal_author,
  };
}

export type SyncCommunicationAlertsResult = {
  clientsUpdated: number;
  error: string | null;
};

type ClientRow = { id: string; business_name: string | null; basecamp_project_id: string | null };

async function mapInBatches<T, R>(
  items: T[],
  batchSize: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const slice = items.slice(i, i + batchSize);
    const chunk = await Promise.all(slice.map(fn));
    out.push(...chunk);
  }
  return out;
}

/**
 * For each client with `basecamp_project_id`, loads that project’s to-do lists from Basecamp,
 * derives overdue open tasks, and writes `communication_alerts` on the current month
 * `client_metrics` row. Basecamp calls run in small concurrent batches to limit rate usage.
 */
export async function syncCommunicationAlertsFromBasecamp(): Promise<SyncCommunicationAlertsResult> {
  const supabase = getSupabaseAdmin();
  const metricMonth = monthStartDate();

  const { data: clients, error: cErr } = await supabase
    .from("clients")
    .select("id, business_name, basecamp_project_id")
    .order("id", { ascending: true });

  if (cErr) {
    console.error("[communication sync] clients:", cErr);
    return { clientsUpdated: 0, error: cErr.message };
  }

  const rows = (clients ?? []) as ClientRow[];
  const withProject = rows.filter((r) => (r.basecamp_project_id ?? "").trim() !== "");

  const allClientIds = rows.map((r) => String(r.id));
  const { data: metricRows, error: mErr } = await supabase
    .from("client_metrics")
    .select("client_id")
    .eq("metric_month", metricMonth)
    .in("client_id", allClientIds);

  if (mErr) {
    console.error("[communication sync] client_metrics batch:", mErr);
    return { clientsUpdated: 0, error: mErr.message };
  }

  const metricClientIds = new Set(
    (metricRows ?? []).map((m) => String((m as { client_id: string }).client_id)),
  );

  const now = new Date().toISOString();

  const emptyPayload = buildCommunicationAlerts([], null);

  const updates = await mapInBatches(withProject, BASECAMP_PROJECT_FETCH_CONCURRENCY, async (c) => {
    const clientId = String(c.id);
    const pid = String(c.basecamp_project_id ?? "").trim();
    const displayName = (c.business_name ?? "").trim() || undefined;

    const [lists, lastMessage] = await Promise.all([
      fetchProjectTodoLists(pid),
      fetchProjectLatestMessageBoardTopic(pid),
    ]);
    const todos = await collectOverdueTodosFromProjectTodoLists(pid, lists, displayName);
    const payload = buildCommunicationAlerts(todos, lastMessage);
    return { clientId, payload };
  });

  const payloadByClientId = new Map<string, CommunicationAlertsState>(
    updates.map((u) => [u.clientId, u.payload]),
  );

  let clientsUpdated = 0;
  for (const c of rows) {
    const clientId = String(c.id);
    if (!metricClientIds.has(clientId)) continue;

    const hasBc = (c.basecamp_project_id ?? "").trim() !== "";
    const payload = hasBc ? (payloadByClientId.get(clientId) ?? emptyPayload) : emptyPayload;

    const { error: uErr } = await supabase
      .from("client_metrics")
      .update({ communication_alerts: payload, updated_at: now })
      .eq("client_id", clientId)
      .eq("metric_month", metricMonth);

    if (uErr) {
      console.error("[communication sync] update", clientId, uErr);
      continue;
    }
    clientsUpdated += 1;
  }

  return { clientsUpdated, error: null };
}
