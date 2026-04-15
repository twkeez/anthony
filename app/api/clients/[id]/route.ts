import { NextResponse, type NextRequest } from "next/server";

import { normalizeActiveServices } from "@/lib/active-services";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

type Ctx = { params: Promise<{ id: string }> };

function isPostgrestError(
  e: unknown,
): e is { message: string; details: string; hint: string; code: string } {
  return (
    typeof e === "object" &&
    e !== null &&
    "code" in e &&
    "message" in e &&
    typeof (e as { message: unknown }).message === "string"
  );
}

export async function PATCH(request: NextRequest, context: Ctx) {
  try {
    const { id } = await context.params;
    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: "invalid_json" }, { status: 400 });
    }

    const patch: Record<string, unknown> = {};
    if (typeof body.email_domain === "string" || body.email_domain === null) {
      patch.email_domain = body.email_domain;
    }
    if (body.active_services !== undefined) {
      patch.active_services = normalizeActiveServices(body.active_services);
    }
    if (typeof body.google_ads_customer_id === "string" || body.google_ads_customer_id === null) {
      patch.google_ads_customer_id = body.google_ads_customer_id;
    }
    if (typeof body.ga4_property_id === "string" || body.ga4_property_id === null) {
      patch.ga4_property_id = body.ga4_property_id;
    }
    if (typeof body.search_console_url === "string" || body.search_console_url === null) {
      patch.search_console_url = body.search_console_url;
    }
    if (body.primary_strategist_id === null || typeof body.primary_strategist_id === "string") {
      const raw = body.primary_strategist_id;
      patch.primary_strategist_id =
        raw === null || String(raw).trim() === "" ? null : String(raw).trim();
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "no_valid_fields" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("clients")
      .update(patch)
      .eq("id", id)
      .select("*")
      .maybeSingle();

    if (error) throw error;
    if (!data) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ client: data });
  } catch (e) {
    console.error("PATCH /api/clients/[id]", e);
    if (isPostgrestError(e)) {
      return NextResponse.json(
        {
          error: e.message,
          details: e.details || undefined,
          hint: e.hint || undefined,
          code: e.code || undefined,
        },
        { status: 500 },
      );
    }
    const message = e instanceof Error ? e.message : "update_failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
