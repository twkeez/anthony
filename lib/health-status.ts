import type { ClientRow, HealthStatus } from "@/types/client";

/**
 * Placeholder rules until Ads / GA4 metrics drive real health.
 * Green: healthy engagement signal (hours + site present, no red-flag notes).
 * Yellow: missing site, low hours, or mixed signals.
 * Red: explicit risk keywords in notes or effectively unstaffed with no web presence.
 */
export function getDummyHealthStatus(client: ClientRow): HealthStatus {
  const notes = (client.client_vibe_notes ?? "").toLowerCase();
  if (
    notes.includes("pita") ||
    notes.includes("demanding") ||
    notes.includes("does not respond")
  ) {
    return "red";
  }

  const hours = client.monthly_hours != null ? Number(client.monthly_hours) : 0;
  const hasSite = Boolean(client.website?.trim());

  if (!hasSite && hours < 2) return "red";
  if (!hasSite || hours < 3) return "yellow";
  if (hours >= 5 && hasSite) return "green";
  return "yellow";
}
