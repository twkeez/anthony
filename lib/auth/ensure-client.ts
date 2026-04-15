import { NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabase/admin";

/** Ensures `clientId` is a real row in `public.clients` (single-tenant org scope). */
export async function ensureClientExists(clientId: string): Promise<NextResponse | null> {
  const id = clientId.trim();
  if (!id) {
    return NextResponse.json({ error: "missing_client_id" }, { status: 400 });
  }
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from("clients").select("id").eq("id", id).maybeSingle();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ error: "client_not_found" }, { status: 404 });
    }
    return null;
  } catch (e) {
    const message = e instanceof Error ? e.message : "client_lookup_failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
