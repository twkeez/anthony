import {
  COMMUNICATION_MESSAGE_BOARD_ROLLING_DAYS,
  filterMessageBoardSnapshotsRolling,
  parseCommunicationAlertsJson,
  type CommunicationLastMessageSnapshot,
} from "@/lib/agency-hub/communication-alerts";
import type { BasecampPerson } from "@/lib/basecamp/basecamp-api";
import { fetchProjectMessageBoardTopicSnapshots } from "@/lib/basecamp/basecamp-api";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/** Message-board `last_updater` activity within this window counts as “current” for staff sync (aligned with communication sync). */
export const STAFF_RECENT_ACTIVITY_MS = COMMUNICATION_MESSAGE_BOARD_ROLLING_DAYS * 86400000;

/** How many `metric_month` rows to scan for `communication_alerts` fallback (inclusive of current). */
const CLIENT_METRICS_MONTH_LOOKBACK = 3;

const BASECAMP_TOPIC_FETCH_CONCURRENCY = 5;

export type StaffActivityKeys = {
  emails: Set<string>;
  ids: Set<string>;
  namesLower: Set<string>;
};

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function activityCutoffMs(): number {
  return Date.now() - STAFF_RECENT_ACTIVITY_MS;
}

function isoWithinWindow(iso: string, cutoffMs: number): boolean {
  const t = new Date(String(iso).trim()).getTime();
  return Number.isFinite(t) && t >= cutoffMs;
}

function addSnapshot(keys: StaffActivityKeys, snap: CommunicationLastMessageSnapshot, cutoffMs: number): void {
  if (!isoWithinWindow(snap.updatedAt, cutoffMs)) return;
  const email = snap.authorEmail?.trim();
  if (email) keys.emails.add(normalizeEmail(email));
  const id = snap.authorId?.trim();
  if (id) keys.ids.add(id);
  const name = snap.authorName?.trim().toLowerCase();
  if (name) keys.namesLower.add(name);
}

function mergeTopicSnapshotsIntoKeys(
  keys: StaffActivityKeys,
  snapshots: readonly CommunicationLastMessageSnapshot[],
  cutoffMs: number,
): void {
  for (const snap of snapshots) {
    addSnapshot(keys, snap, cutoffMs);
  }
}

function lastNMetricMonthStarts(n: number): string[] {
  const out: string[] = [];
  const d = new Date();
  for (let i = 0; i < n; i++) {
    const u = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i, 1));
    out.push(u.toISOString().slice(0, 10));
  }
  return out;
}

async function mapInBatches<T, R>(items: T[], batchSize: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const slice = items.slice(i, i + batchSize);
    out.push(...(await Promise.all(slice.map(fn))));
  }
  return out;
}

/**
 * Collects `last_updater` emails, ids, and display names from message-board topics (page 1 per project)
 * updated inside the communication rolling window for all mapped client projects.
 */
export async function loadStaffActivityFromClientProjects(): Promise<StaffActivityKeys> {
  const keys: StaffActivityKeys = {
    emails: new Set(),
    ids: new Set(),
    namesLower: new Set(),
  };
  const cutoffMs = activityCutoffMs();

  const supabase = getSupabaseAdmin();
  const { data: clients, error } = await supabase
    .from("clients")
    .select("basecamp_project_id")
    .not("basecamp_project_id", "is", null);

  if (error) {
    console.warn("[staff activity] clients:", error.message);
    return keys;
  }

  const projectIds = new Set<string>();
  for (const row of clients ?? []) {
    const pid = String((row as { basecamp_project_id: string | null }).basecamp_project_id ?? "").trim();
    if (pid) projectIds.add(pid);
  }

  const ids = [...projectIds];
  await mapInBatches(ids, BASECAMP_TOPIC_FETCH_CONCURRENCY, async (pid) => {
    const raw = await fetchProjectMessageBoardTopicSnapshots(pid);
    const snaps = filterMessageBoardSnapshotsRolling(raw);
    mergeTopicSnapshotsIntoKeys(keys, snaps, cutoffMs);
  });

  return keys;
}

/**
 * Merges authors from stored `client_metrics.communication_alerts` (last 3 metric months) when a
 * message `updatedAt` falls within the 90-day window (covers gaps if live topic fetch fails).
 */
export async function mergeStaffActivityFromClientMetrics(keys: StaffActivityKeys): Promise<void> {
  const cutoffMs = activityCutoffMs();
  const months = lastNMetricMonthStarts(CLIENT_METRICS_MONTH_LOOKBACK);
  const supabase = getSupabaseAdmin();

  const { data: rows, error } = await supabase
    .from("client_metrics")
    .select("communication_alerts")
    .in("metric_month", months);

  if (error) {
    console.warn("[staff activity] client_metrics:", error.message);
    return;
  }

  for (const row of rows ?? []) {
    const raw = (row as { communication_alerts: unknown }).communication_alerts;
    const state = parseCommunicationAlertsJson(raw);
    if (!state) continue;

    if (state.lastMessage) {
      addSnapshot(keys, state.lastMessage, cutoffMs);
    }
    for (const t of state.unansweredClientThreads ?? []) {
      const snap: CommunicationLastMessageSnapshot = {
        subject: t.subject,
        excerpt: t.excerpt,
        updatedAt: t.updatedAt,
        ...(t.authorName ? { authorName: t.authorName } : {}),
      };
      addSnapshot(keys, snap, cutoffMs);
    }
  }
}

/** Marks people as recently active from Basecamp directory `updated_at` when present. */
export function mergeStaffActivityFromPeopleDirectory(
  people: readonly BasecampPerson[],
  keys: StaffActivityKeys,
): void {
  const cutoffMs = activityCutoffMs();
  for (const p of people) {
    const raw = p.updated_at?.trim();
    if (!raw) continue;
    if (!isoWithinWindow(raw, cutoffMs)) continue;
    const email = (p.email_address ?? "").trim();
    if (email) keys.emails.add(normalizeEmail(email));
    keys.ids.add(p.id);
    const n = (p.name ?? "").trim().toLowerCase();
    if (n) keys.namesLower.add(n);
  }
}
