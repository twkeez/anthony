import { NextResponse, type NextRequest } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabase/admin";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: Ctx) {
  const { id: client_id } = await context.params;
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("tasks")
      .select("*")
      .eq("client_id", client_id)
      .order("due_date", { ascending: true, nullsFirst: false });

    if (error) throw error;
    return NextResponse.json({ tasks: data ?? [] });
  } catch (e) {
    const message = e instanceof Error ? e.message : "tasks_fetch_failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest, context: Ctx) {
  const { id: client_id } = await context.params;
  const body = (await request.json()) as {
    title?: string;
    description?: string | null;
    assigned_to?: string | null;
    due_date?: string | null;
  };

  if (!body.title?.trim()) {
    return NextResponse.json({ error: "title_required" }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("tasks")
      .insert({
        client_id,
        title: body.title.trim(),
        description: body.description?.trim() || null,
        assigned_to: body.assigned_to?.trim() || null,
        due_date: body.due_date?.trim() || null,
        status: "pending",
      })
      .select("*")
      .single();

    if (error) throw error;
    return NextResponse.json({ task: data });
  } catch (e) {
    const message = e instanceof Error ? e.message : "task_create_failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
