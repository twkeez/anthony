import { NextResponse, type NextRequest } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { CommunicationInternalPartyRow } from "@/lib/communication/internal-parties-types";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: Ctx) {
  try {
    const { id } = await context.params;
    const pid = String(id ?? "").trim();
    if (!pid) return NextResponse.json({ error: "missing_id" }, { status: 400 });

    const body = (await request.json()) as Record<string, unknown>;
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (typeof body.email === "string") patch.email = body.email.trim().toLowerCase() || null;
    if (body.basecamp_id === null || typeof body.basecamp_id === "string") {
      patch.basecamp_id = body.basecamp_id === null ? null : String(body.basecamp_id).trim() || null;
    }
    if (body.display_name === null || typeof body.display_name === "string") {
      patch.display_name =
        body.display_name === null ? null : String(body.display_name).trim() || null;
    }
    if (body.note === null || typeof body.note === "string") {
      patch.note = body.note === null ? null : String(body.note).trim() || null;
    }
    if (typeof body.is_active === "boolean") patch.is_active = body.is_active;

    if (Object.keys(patch).length <= 1) {
      return NextResponse.json({ error: "no_valid_fields" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("communication_internal_parties")
      .update(patch)
      .eq("id", pid)
      .select("*")
      .maybeSingle();
    if (error) {
      if ((error as { code?: string }).code === "23505") {
        return NextResponse.json(
          { error: "duplicate_active_email_or_basecamp_id" },
          { status: 409 },
        );
      }
      if ((error as { code?: string }).code === "23514") {
        return NextResponse.json(
          { error: "at_least_one_identifier_required_after_update" },
          { status: 400 },
        );
      }
      throw error;
    }
    if (!data) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ party: data as CommunicationInternalPartyRow });
  } catch (e) {
    const message = e instanceof Error ? e.message : "internal_parties_update_failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** Soft-deactivate (keeps history; excluded from sync classification). */
export async function DELETE(_request: NextRequest, context: Ctx) {
  try {
    const { id } = await context.params;
    const pid = String(id ?? "").trim();
    if (!pid) return NextResponse.json({ error: "missing_id" }, { status: 400 });

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("communication_internal_parties")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("id", pid)
      .select("*")
      .maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ party: data as CommunicationInternalPartyRow });
  } catch (e) {
    const message = e instanceof Error ? e.message : "internal_parties_delete_failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
