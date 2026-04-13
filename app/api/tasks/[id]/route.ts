import { NextResponse, type NextRequest } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { TaskStatus } from "@/types/database.types";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: Ctx) {
  const { id } = await context.params;
  const body = (await request.json()) as { status?: TaskStatus };

  if (body.status !== "pending" && body.status !== "completed") {
    return NextResponse.json({ error: "invalid_status" }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("tasks")
      .update({ status: body.status, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("*")
      .maybeSingle();

    if (error) throw error;
    if (!data) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ task: data });
  } catch (e) {
    const message = e instanceof Error ? e.message : "task_update_failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
