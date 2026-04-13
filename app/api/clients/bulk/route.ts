import { NextResponse } from "next/server";

import { rowHasBlockingIssues, type ClientImportPreviewRow } from "@/lib/client-import/schema";
import { normalizeActiveServices } from "@/lib/active-services";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

type BulkBody = {
  rows?: ClientImportPreviewRow[];
  /** When true, rows that do not match an existing client are rejected instead of inserted. */
  update_only?: boolean;
};

type DbClientRow = Record<string, unknown>;

function escapeIlikePattern(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

function buildInsertPayload(row: ClientImportPreviewRow) {
  const seo = row.csvCellPresent.service_seo ? row.service_seo : false;
  const ppc = row.csvCellPresent.service_ppc ? row.service_ppc : false;
  return {
    business_name: row.client_name.trim(),
    internal_crm_id: row.internal_crm_id?.trim() || null,
    active_services: normalizeActiveServices({ seo, ppc, social: false, orm: false }),
    monthly_ad_budget: row.monthly_ad_budget,
    target_cpa: row.target_cpa,
    google_ads_customer_id: row.google_ads_id?.trim() || null,
    ga4_property_id: row.ga4_property_id?.trim() || null,
    search_console_url: row.search_console_url?.trim() || null,
    tag_manager_id: row.tag_manager_id?.trim() || null,
    gbp_location_id: row.gbp_location_id?.trim() || null,
    email_domain: row.email_domain?.trim() || null,
    basecamp_project_id: row.basecamp_project_id?.trim() || null,
    basecamp_email: row.basecamp_email?.trim() || null,
    updated_at: new Date().toISOString(),
  };
}

/** Partial update: only fields with a non-empty CSV cell may change existing DB values. */
function buildMergedUpdate(existing: DbClientRow, row: ClientImportPreviewRow): Record<string, unknown> {
  const out: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (row.client_name.trim()) {
    out.business_name = row.client_name.trim();
  }

  if (row.csvCellPresent.internal_crm_id) {
    const v = row.internal_crm_id?.trim();
    if (v) out.internal_crm_id = v;
  }

  const prev = normalizeActiveServices(existing.active_services);
  let seo = prev.seo;
  let ppc = prev.ppc;
  if (row.csvCellPresent.service_seo) seo = row.service_seo;
  if (row.csvCellPresent.service_ppc) ppc = row.service_ppc;
  out.active_services = normalizeActiveServices({ ...prev, seo, ppc });

  if (row.csvCellPresent.monthly_ad_budget && row.monthly_ad_budget !== null) {
    out.monthly_ad_budget = row.monthly_ad_budget;
  }
  if (row.csvCellPresent.target_cpa && row.target_cpa !== null) {
    out.target_cpa = row.target_cpa;
  }

  const stringFields: Array<{
    present: keyof ClientImportPreviewRow["csvCellPresent"];
    fromRow: keyof Pick<
      ClientImportPreviewRow,
      | "google_ads_id"
      | "ga4_property_id"
      | "search_console_url"
      | "tag_manager_id"
      | "gbp_location_id"
      | "email_domain"
      | "basecamp_project_id"
      | "basecamp_email"
    >;
    dbKey: string;
  }> = [
    { present: "google_ads_id", fromRow: "google_ads_id", dbKey: "google_ads_customer_id" },
    { present: "ga4_property_id", fromRow: "ga4_property_id", dbKey: "ga4_property_id" },
    { present: "search_console_url", fromRow: "search_console_url", dbKey: "search_console_url" },
    { present: "tag_manager_id", fromRow: "tag_manager_id", dbKey: "tag_manager_id" },
    { present: "gbp_location_id", fromRow: "gbp_location_id", dbKey: "gbp_location_id" },
    { present: "email_domain", fromRow: "email_domain", dbKey: "email_domain" },
    { present: "basecamp_project_id", fromRow: "basecamp_project_id", dbKey: "basecamp_project_id" },
    { present: "basecamp_email", fromRow: "basecamp_email", dbKey: "basecamp_email" },
  ];

  for (const { present, fromRow, dbKey } of stringFields) {
    if (row.csvCellPresent[present]) {
      const v = row[fromRow]?.trim();
      if (v) out[dbKey] = v;
    }
  }

  return out;
}

async function findExistingClient(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  row: ClientImportPreviewRow,
): Promise<{ client: DbClientRow | null; error?: string }> {
  const crm = row.internal_crm_id?.trim();
  if (crm) {
    const { data: crmRows, error } = await supabase.from("clients").select("*").eq("internal_crm_id", crm).limit(2);
    if (error) throw error;
    if (crmRows.length > 1) {
      return { client: null, error: "Multiple clients share this internal_crm_id." };
    }
    if (crmRows.length === 1) {
      return { client: crmRows[0] as DbClientRow };
    }
  }

  const name = row.client_name.trim();
  if (!name) {
    return { client: null };
  }

  const namePattern = escapeIlikePattern(name);
  const { data: nameRows, error: nameErr } = await supabase
    .from("clients")
    .select("*")
    .ilike("business_name", namePattern)
    .limit(2);

  if (nameErr) throw nameErr;
  if (nameRows.length > 1) {
    return {
      client: null,
      error:
        "Multiple clients share this name (case-insensitive). Disambiguate with internal_crm_id or fix duplicates in the database.",
    };
  }
  if (nameRows.length === 1) {
    return { client: nameRows[0] as DbClientRow };
  }

  return { client: null };
}

export async function POST(request: Request) {
  let body: BulkBody;
  try {
    body = (await request.json()) as BulkBody;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const rows = body.rows;
  const updateOnly = Boolean(body.update_only);
  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: "rows_required" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const results: Array<{
    rowIndex: number;
    status: "inserted" | "updated" | "skipped" | "error";
    id?: string;
    error?: string;
  }> = [];

  for (const row of rows) {
    const rowIndex = row.rowIndex;
    if (rowHasBlockingIssues(row)) {
      results.push({
        rowIndex,
        status: "skipped",
        error: "missing_client_name",
      });
      continue;
    }

    try {
      const { client: existing, error: findErr } = await findExistingClient(supabase, row);
      if (findErr) {
        results.push({ rowIndex, status: "error", error: findErr });
        continue;
      }

      if (existing) {
        const patch = buildMergedUpdate(existing, row);
        const { data, error } = await supabase
          .from("clients")
          .update(patch)
          .eq("id", String(existing.id))
          .select("id")
          .maybeSingle();

        if (error) throw error;
        results.push({ rowIndex, status: "updated", id: data?.id ?? String(existing.id) });
        continue;
      }

      if (updateOnly) {
        results.push({
          rowIndex,
          status: "error",
          error:
            "No matching client. Match on internal_crm_id or business name (case-insensitive). Update-only mode does not create clients.",
        });
        continue;
      }

      if (!row.client_name.trim()) {
        results.push({
          rowIndex,
          status: "error",
          error: "No matching client and client_name is empty — cannot create a new client.",
        });
        continue;
      }

      const insertPayload = buildInsertPayload(row);
      const { data, error } = await supabase.from("clients").insert(insertPayload).select("id").maybeSingle();

      if (error) throw error;
      results.push({ rowIndex, status: "inserted", id: data?.id });
    } catch (e) {
      results.push({
        rowIndex,
        status: "error",
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  const errors = results.filter((r) => r.status === "error");
  const skipped = results.filter((r) => r.status === "skipped");

  return NextResponse.json({
    ok: errors.length === 0,
    summary: {
      total: rows.length,
      inserted: results.filter((r) => r.status === "inserted").length,
      updated: results.filter((r) => r.status === "updated").length,
      skipped: skipped.length,
      errors: errors.length,
    },
    results,
  });
}
