/**
 * Client CSV import — columns match `public/client_import_template.csv` (plus common aliases).
 * Aliases include `business_name` / `client name`, `google_ads_customer_id` / `google ads customer id` → Ads ID,
 * `ga_property_id` / `ga4 property id` → GA4, `crm_id` / `internal crm id` → internal_crm_id,
 * `service ppc` / `service seo` (spaced headers from Excel/Sheets).
 * Empty cells mean “do not change” on merge for existing clients (see `csvCellPresent`).
 */

export type CsvCellPresent = {
  client_id: boolean;
  internal_crm_id: boolean;
  service_ppc: boolean;
  service_seo: boolean;
  monthly_ad_budget: boolean;
  target_cpa: boolean;
  google_ads_id: boolean;
  ga4_property_id: boolean;
  search_console_url: boolean;
  tag_manager_id: boolean;
  gbp_location_id: boolean;
  email_domain: boolean;
  basecamp_project_id: boolean;
  basecamp_email: boolean;
};

export type ClientImportCsvRow = {
  /** Anthony `clients.id` (UUID) — strongest match for bulk updates from exports. */
  client_id: string | null;
  client_name: string;
  internal_crm_id: string | null;
  service_ppc: boolean;
  service_seo: boolean;
  monthly_ad_budget: number | null;
  target_cpa: number | null;
  google_ads_id: string | null;
  ga4_property_id: string | null;
  search_console_url: string | null;
  tag_manager_id: string | null;
  gbp_location_id: string | null;
  email_domain: string | null;
  basecamp_project_id: string | null;
  basecamp_email: string | null;
};

export type ClientImportRowIssue = {
  code: "missing_client_name" | "missing_google_ads_for_ppc" | "crm_only_new_client";
  message: string;
};

export type ClientImportPreviewRow = ClientImportCsvRow & {
  rowIndex: number;
  csvCellPresent: CsvCellPresent;
  issues: ClientImportRowIssue[];
};

const TRUTHY = new Set(["1", "true", "yes", "y", "t", "on"]);
const FALSY = new Set(["0", "false", "no", "n", "f", "off", ""]);

export function parseBoolCell(raw: string | undefined | null): boolean {
  if (raw === undefined || raw === null) return false;
  const s = String(raw).trim().toLowerCase();
  if (s === "") return false;
  if (TRUTHY.has(s)) return true;
  if (FALSY.has(s)) return false;
  return false;
}

export function parseNumberCell(raw: string | undefined | null): number | null {
  if (raw === undefined || raw === null) return null;
  const s = String(raw).trim();
  if (s === "") return null;
  const n = Number.parseFloat(s.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

export function trimOrNull(raw: string | undefined | null): string | null {
  if (raw === undefined || raw === null) return null;
  const s = String(raw).trim();
  return s === "" ? null : s;
}

function cellPresent(raw: unknown): boolean {
  if (raw === undefined || raw === null) return false;
  return String(raw).trim() !== "";
}

/** Normalize PapaParse header keys to lowercase for resilient lookups. */
export function lowerKeyRecord(row: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(row).map(([k, v]) => [String(k).trim().toLowerCase(), v]),
  );
}

/** First non-empty trimmed string among keys (spreadsheet-friendly aliases). */
function firstString(r: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = trimOrNull(String(r[k] ?? ""));
    if (v) return v;
  }
  return null;
}

function presentAny(r: Record<string, unknown>, keys: string[]): boolean {
  return keys.some((k) => cellPresent(r[k]));
}

/** True if `s` looks like a Supabase/Postgres UUID (client primary key). */
export function looksLikeClientUuid(s: string | null | undefined): boolean {
  if (s == null) return false;
  const t = String(s).trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(t);
}

export function rawRecordToImportRow(row: Record<string, unknown>, rowIndex: number): ClientImportPreviewRow {
  const r = lowerKeyRecord(row);

  const client_id =
    firstString(r, ["client_id", "anthony_client_id", "agencypulse_client_id", "client uuid"]) ?? null;

  const client_name =
    firstString(r, ["client_name", "client name", "business_name", "business name", "client", "company"]) ?? "";
  const internal_crm_id =
    firstString(r, [
      "internal_crm_id",
      "internal crm id",
      "crm_id",
      "crm",
      "hubspot_id",
      "salesforce_id",
    ]) ?? null;

  const googleAdsKeys = [
    "google_ads_id",
    "google_ads_customer_id",
    "ads_customer_id",
    "google ads customer id",
    "google ads id",
    "google ads cid",
    "gads_customer_id",
    "gads cid",
    "ads id",
    "ads customer id",
    "google ads account",
    "google ads account id",
  ];
  const ga4Keys = [
    "ga4_property_id",
    "ga_property_id",
    "ga4_id",
    "analytics_property_id",
    "ga4 property id",
    "ga4 property",
    "ga4 numeric id",
    "ga property",
    "analytics property",
  ];

  const csvCellPresent: CsvCellPresent = {
    client_id: presentAny(r, ["client_id", "anthony_client_id", "agencypulse_client_id", "client uuid"]),
    internal_crm_id: presentAny(r, [
      "internal_crm_id",
      "internal crm id",
      "crm_id",
      "crm",
      "hubspot_id",
      "salesforce_id",
    ]),
    service_ppc: presentAny(r, ["service_ppc", "service ppc", "ppc"]),
    service_seo: presentAny(r, ["service_seo", "service seo", "seo"]),
    monthly_ad_budget: presentAny(r, ["monthly_ad_budget", "monthly ad budget"]),
    target_cpa: presentAny(r, ["target_cpa", "target cpa"]),
    google_ads_id: presentAny(r, googleAdsKeys),
    ga4_property_id: presentAny(r, ga4Keys),
    search_console_url: presentAny(r, ["search_console_url", "search console url", "gsc url"]),
    tag_manager_id: presentAny(r, ["tag_manager_id", "tag manager id", "gtm id"]),
    gbp_location_id: presentAny(r, ["gbp_location_id", "gbp location id", "google business profile"]),
    email_domain: presentAny(r, ["email_domain", "email domain"]),
    basecamp_project_id: presentAny(r, ["basecamp_project_id", "basecamp project id"]),
    basecamp_email: presentAny(r, ["basecamp_email", "basecamp email"]),
  };

  const service_ppc = parseBoolCell(firstString(r, ["service_ppc", "service ppc", "ppc"]) ?? "");
  const service_seo = parseBoolCell(firstString(r, ["service_seo", "service seo", "seo"]) ?? "");
  const monthly_ad_budget = parseNumberCell(firstString(r, ["monthly_ad_budget", "monthly ad budget"]) ?? "");
  const target_cpa = parseNumberCell(firstString(r, ["target_cpa", "target cpa"]) ?? "");
  const google_ads_id = firstString(r, googleAdsKeys);
  const ga4_property_id = firstString(r, ga4Keys);
  const search_console_url = trimOrNull(firstString(r, ["search_console_url", "search console url", "gsc url"]) ?? "");
  const tag_manager_id = trimOrNull(firstString(r, ["tag_manager_id", "tag manager id", "gtm id"]) ?? "");
  const gbp_location_id = trimOrNull(firstString(r, ["gbp_location_id", "gbp location id", "google business profile"]) ?? "");
  const email_domain = trimOrNull(firstString(r, ["email_domain", "email domain"]) ?? "");
  const basecamp_project_id = trimOrNull(
    firstString(r, ["basecamp_project_id", "basecamp project id"]) ?? "",
  );
  const basecamp_email = trimOrNull(firstString(r, ["basecamp_email", "basecamp email"]) ?? "");

  const issues: ClientImportRowIssue[] = [];
  const hasIdentity = Boolean(
    client_name.trim() || internal_crm_id?.trim() || (client_id?.trim() && looksLikeClientUuid(client_id)),
  );
  if (!hasIdentity) {
    issues.push({
      code: "missing_client_name",
      message:
        "Provide client_name (or business_name), internal_crm_id, and/or client_id (Anthony UUID from exports).",
    });
  }
  if (internal_crm_id?.trim() && !client_name.trim() && !looksLikeClientUuid(client_id)) {
    issues.push({
      code: "crm_only_new_client",
      message:
        "No client_name — row can only update an existing client matched by internal_crm_id or client_id (cannot create a new client without a name).",
    });
  }
  if (service_ppc && !google_ads_id) {
    issues.push({
      code: "missing_google_ads_for_ppc",
      message: "PPC is enabled but google_ads_id is missing.",
    });
  }

  return {
    rowIndex,
    client_id,
    client_name,
    internal_crm_id,
    service_ppc,
    service_seo,
    monthly_ad_budget,
    target_cpa,
    google_ads_id,
    ga4_property_id,
    search_console_url,
    tag_manager_id,
    gbp_location_id,
    email_domain,
    basecamp_project_id,
    basecamp_email,
    csvCellPresent,
    issues,
  };
}

export function rowHasBlockingIssues(row: ClientImportPreviewRow): boolean {
  return row.issues.some((i) => i.code === "missing_client_name");
}

/** CRM ID present but no display name — updates by CRM are fine; new inserts will fail without a name. */
export function rowHasCrmOnlyWarning(row: ClientImportPreviewRow): boolean {
  return row.issues.some((i) => i.code === "crm_only_new_client");
}

/** Highlight PPC rows missing Ads ID (non-blocking warning). */
export function rowHasPpcMissingAdsWarning(row: ClientImportPreviewRow): boolean {
  return row.issues.some((i) => i.code === "missing_google_ads_for_ppc");
}
