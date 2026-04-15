/**
 * GA4 Data API expects `properties/{numericId}`. Universal Analytics IDs (UA-…)
 * and web stream measurement IDs (G-…) are not valid property IDs for that API.
 */

export type ParseGa4PropertyIdResult =
  | { ok: true; numericId: string }
  | { ok: false; code: "empty" | "ua_tracking_id" | "g_measurement_id" | "invalid" };

export function parseGa4PropertyId(raw: string | null | undefined): ParseGa4PropertyIdResult {
  if (raw == null || raw.trim() === "") {
    return { ok: false, code: "empty" };
  }
  const t = raw.trim();
  if (/^UA-/i.test(t)) {
    return { ok: false, code: "ua_tracking_id" };
  }
  if (/^G-[A-Z0-9]+$/i.test(t)) {
    return { ok: false, code: "g_measurement_id" };
  }
  const propMatch = t.match(/^properties\/(\d+)$/i);
  if (propMatch) {
    return { ok: true, numericId: propMatch[1] };
  }
  const collapsed = t.replace(/\s+/g, "");
  if (/^\d+$/.test(collapsed)) {
    return { ok: true, numericId: collapsed };
  }
  return { ok: false, code: "invalid" };
}

/** One-line hint for dashboards when the stored value will not work with the Data API. */
export function compactGa4PropertyIdIssue(raw: string | null | undefined): string | null {
  const p = parseGa4PropertyId(raw);
  if (p.ok || p.code === "empty") return null;
  switch (p.code) {
    case "ua_tracking_id":
      return "This is a Universal Analytics ID (UA-…). Enter the numeric GA4 property ID.";
    case "g_measurement_id":
      return "This is a measurement ID (G-…). Enter the numeric GA4 property ID.";
    case "invalid":
      return "Use digits only (or properties/123…).";
    default:
      return null;
  }
}

/** User-facing sentence for sync_error / logs when the stored value is wrong shape. */
export function ga4PropertyIdSyncHint(parsed: Extract<ParseGa4PropertyIdResult, { ok: false }>): string {
  switch (parsed.code) {
    case "empty":
      return "GA4: no GA4 Property ID saved for this client.";
    case "ua_tracking_id":
      return "GA4: stored value looks like a Universal Analytics ID (UA-…). Save the numeric GA4 property ID (Admin → Property settings) or use GA4 mapper.";
    case "g_measurement_id":
      return "GA4: stored value looks like a measurement ID (G-…). Save the numeric GA4 property ID instead.";
    case "invalid":
      return "GA4: Property ID must be digits only, or `properties/{digits}`.";
    default:
      return "GA4: invalid Property ID.";
  }
}
