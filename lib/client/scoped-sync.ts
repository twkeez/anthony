/**
 * Client-only: POST /api/sync with a scope (no server-only imports).
 */

export type ScopedSyncScope = "ads" | "ga4" | "gsc" | "lighthouse" | "communication";

export function postScopedSync(scope: ScopedSyncScope): Promise<Response> {
  return fetch("/api/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scope }),
  });
}
