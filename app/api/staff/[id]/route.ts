import { NextResponse, type NextRequest } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { StaffRow } from "@/lib/staff/staff-types";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: Ctx) {
  try {
    const { id } = await context.params;
    const sid = String(id ?? "").trim();
    if (!sid) return NextResponse.json({ error: "missing_id" }, { status: 400 });

    const body = (await request.json()) as Record<string, unknown>;
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (typeof body.full_name === "string") patch.full_name = body.full_name.trim();
    if (typeof body.email === "string") patch.email = body.email.trim().toLowerCase();
    if (body.basecamp_id === null || typeof body.basecamp_id === "string") {
      patch.basecamp_id = body.basecamp_id === null ? null : String(body.basecamp_id).trim() || null;
    }
    if (body.basecamp_name_handle === null || typeof body.basecamp_name_handle === "string") {
      patch.basecamp_name_handle =
        body.basecamp_name_handle === null ? null : String(body.basecamp_name_handle).trim() || null;
    }
    if (body.writing_style_notes === null || typeof body.writing_style_notes === "string") {
      patch.writing_style_notes =
        body.writing_style_notes === null ? null : String(body.writing_style_notes).trim() || null;
    }
    if (typeof body.is_active === "boolean") patch.is_active = body.is_active;

    if (Object.keys(patch).length <= 1) {
      return NextResponse.json({ error: "no_valid_fields" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from("staff").update(patch).eq("id", sid).select("*").maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ staff: data as StaffRow });
  } catch (e) {
    const message = e instanceof Error ? e.message : "staff_update_failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** Soft-deactivate (keeps FK integrity on `clients.primary_strategist_id`). */
export async function DELETE(_request: NextRequest, context: Ctx) {
  try {
    const { id } = await context.params;
    const sid = String(id ?? "").trim();
    if (!sid) return NextResponse.json({ error: "missing_id" }, { status: 400 });

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("staff")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("id", sid)
      .select("*")
      .maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ staff: data as StaffRow });
  } catch (e) {
    const message = e instanceof Error ? e.message : "staff_delete_failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
