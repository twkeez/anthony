import { NextResponse, type NextRequest } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { StaffRow } from "@/lib/staff/staff-types";

function isStaffCreateBody(v: unknown): v is {
  full_name: string;
  email: string;
  basecamp_id?: string | null;
  basecamp_name_handle?: string | null;
  writing_style_notes?: string | null;
  is_active?: boolean;
} {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return typeof o.full_name === "string" && typeof o.email === "string";
}

export async function GET() {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("staff")
      .select("*")
      .order("full_name", { ascending: true });
    if (error) throw error;
    return NextResponse.json({ staff: (data ?? []) as StaffRow[] });
  } catch (e) {
    const message = e instanceof Error ? e.message : "staff_list_failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (!isStaffCreateBody(body)) {
      return NextResponse.json({ error: "invalid_body" }, { status: 400 });
    }
    const full_name = body.full_name.trim();
    const email = body.email.trim().toLowerCase();
    if (!full_name || !email) {
      return NextResponse.json({ error: "full_name_and_email_required" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from("staff")
      .insert({
        full_name,
        email,
        basecamp_id: typeof body.basecamp_id === "string" ? body.basecamp_id.trim() || null : null,
        basecamp_name_handle:
          typeof body.basecamp_name_handle === "string" ? body.basecamp_name_handle.trim() || null : null,
        writing_style_notes:
          typeof body.writing_style_notes === "string" ? body.writing_style_notes.trim() || null : null,
        is_active: typeof body.is_active === "boolean" ? body.is_active : true,
        updated_at: now,
      })
      .select("*")
      .maybeSingle();

    if (error) throw error;
    if (!data) return NextResponse.json({ error: "insert_failed" }, { status: 500 });
    return NextResponse.json({ staff: data as StaffRow });
  } catch (e) {
    const message = e instanceof Error ? e.message : "staff_create_failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
