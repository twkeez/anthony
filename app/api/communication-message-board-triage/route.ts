import { NextResponse, type NextRequest } from "next/server";

import type { CommunicationMessageBoardTriageRow } from "@/lib/communication/message-board-triage-types";
import { ensureClientExists } from "@/lib/auth/ensure-client";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const SNOOZE_DAYS_ALLOWED = new Set([1, 3, 7, 14]);

function isPostBody(v: unknown): v is {
  client_id: string;
  thread_key: string;
  thread_updated_at: string;
  action: "dismiss" | "snooze";
  snooze_days?: number;
} {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  if (typeof o.client_id !== "string" || o.client_id.trim() === "") return false;
  if (typeof o.thread_key !== "string" || o.thread_key.trim() === "") return false;
  if (typeof o.thread_updated_at !== "string" || o.thread_updated_at.trim() === "") return false;
  if (o.action !== "dismiss" && o.action !== "snooze") return false;
  return true;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (!isPostBody(body)) {
      return NextResponse.json({ error: "invalid_body" }, { status: 400 });
    }
    const client_id = body.client_id.trim();
    const scope = await ensureClientExists(client_id);
    if (scope) return scope;

    const thread_key = body.thread_key.trim();
    const thread_updated_at = body.thread_updated_at.trim();
    const now = new Date().toISOString();

    let snooze_until: string | null = null;
    if (body.action === "snooze") {
      const days = typeof body.snooze_days === "number" ? body.snooze_days : 3;
      if (!SNOOZE_DAYS_ALLOWED.has(days)) {
        return NextResponse.json({ error: "invalid_snooze_days" }, { status: 400 });
      }
      snooze_until = new Date(Date.now() + days * 86_400_000).toISOString();
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("communication_message_board_triage")
      .upsert(
        {
          client_id,
          thread_key,
          thread_updated_at,
          action: body.action,
          snooze_until,
          updated_at: now,
        },
        { onConflict: "client_id,thread_key" },
      )
      .select("*")
      .maybeSingle();

    if (error) throw error;
    if (!data) return NextResponse.json({ error: "upsert_failed" }, { status: 500 });
    return NextResponse.json({ triage: data as CommunicationMessageBoardTriageRow });
  } catch (e) {
    const message = e instanceof Error ? e.message : "triage_upsert_failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const id = new URL(request.url).searchParams.get("id")?.trim();
    if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 });

    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from("communication_message_board_triage").delete().eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "triage_delete_failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
