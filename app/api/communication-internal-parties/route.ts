import { NextResponse, type NextRequest } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { CommunicationInternalPartyRow } from "@/lib/communication/internal-parties-types";

function normalizePartyBody(v: unknown): {
  email: string | null;
  basecamp_id: string | null;
  display_name: string | null;
  note: string | null;
  is_active: boolean;
} | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const email = typeof o.email === "string" ? o.email.trim().toLowerCase() || null : null;
  const basecamp_id = typeof o.basecamp_id === "string" ? o.basecamp_id.trim() || null : null;
  const display_name = typeof o.display_name === "string" ? o.display_name.trim() || null : null;
  const note = typeof o.note === "string" ? o.note.trim() || null : null;
  const is_active = typeof o.is_active === "boolean" ? o.is_active : true;
  if (!email && !basecamp_id && !display_name) return null;
  return { email, basecamp_id, display_name, note, is_active };
}

export async function GET() {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("communication_internal_parties")
      .select("*")
      .order("is_active", { ascending: false })
      .order("display_name", { ascending: true, nullsFirst: false })
      .order("email", { ascending: true, nullsFirst: false });
    if (error) throw error;
    return NextResponse.json({ parties: (data ?? []) as CommunicationInternalPartyRow[] });
  } catch (e) {
    const message = e instanceof Error ? e.message : "internal_parties_list_failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const normalized = normalizePartyBody(body);
    if (!normalized) {
      return NextResponse.json(
        { error: "provide_at_least_one_of_email_basecamp_id_display_name" },
        { status: 400 },
      );
    }

    const supabase = getSupabaseAdmin();
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from("communication_internal_parties")
      .insert({
        email: normalized.email,
        basecamp_id: normalized.basecamp_id,
        display_name: normalized.display_name,
        note: normalized.note,
        is_active: normalized.is_active,
        updated_at: now,
      })
      .select("*")
      .maybeSingle();

    if (error) {
      if ((error as { code?: string }).code === "23505") {
        return NextResponse.json(
          { error: "duplicate_active_email_or_basecamp_id" },
          { status: 409 },
        );
      }
      throw error;
    }
    if (!data) return NextResponse.json({ error: "insert_failed" }, { status: 500 });
    return NextResponse.json({ party: data as CommunicationInternalPartyRow });
  } catch (e) {
    const message = e instanceof Error ? e.message : "internal_parties_create_failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
