import type { ClientRow } from "@/types/client";

/** Current-month metrics row joined in dashboard list for traffic-light status. */
export type ClientWithSyncSnapshot = ClientRow & {
  sync_error: string | null;
  last_synced_at: string | null;
};

const MS_48H = 48 * 60 * 60 * 1000;

/**
 * Traffic-light status for the client card dot.
 * - RED: `sync_error` is set on the current-month metrics row.
 * - GREEN: synced within the last 48h and no sync_error.
 * - YELLOW: default (never synced this month, stale sync, etc.).
 */
export function getClientStatusColor(client: ClientWithSyncSnapshot): string {
  if (client.sync_error != null && String(client.sync_error).trim() !== "") {
    return "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]";
  }

  const raw = client.last_synced_at;
  if (raw) {
    const t = new Date(raw).getTime();
    if (Number.isFinite(t) && Date.now() - t <= MS_48H) {
      return "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]";
    }
  }

  return "bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]";
}

export function getClientStatusLabel(client: ClientWithSyncSnapshot): string {
  if (client.sync_error != null && String(client.sync_error).trim() !== "") {
    return "Sync reported errors";
  }
  const raw = client.last_synced_at;
  if (raw) {
    const t = new Date(raw).getTime();
    if (Number.isFinite(t) && Date.now() - t <= MS_48H) {
      return "Synced in the last 48 hours, no blocking errors";
    }
    return "Stale or partial sync — open client for details";
  }
  return "No sync yet this month";
}
