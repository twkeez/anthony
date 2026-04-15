import { NextResponse, type NextRequest } from "next/server";

import { ensureClientExists } from "@/lib/auth/ensure-client";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { ReportBlock, ReportStatus } from "@/types/database.types";

type Body = {
  client_id: string;
  period_start: string;
  period_end: string;
  blocks: ReportBlock[];
  strategist_notes?: string | null;
  status?: ReportStatus;
};

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Body;
    const client_id = String(body.client_id ?? "").trim();
    const period_start = String(body.period_start ?? "").trim();
    const period_end = String(body.period_end ?? "").trim();
    const status: ReportStatus = body.status === "published" ? "published" : "draft";
    if (!client_id || !period_start || !period_end || !Array.isArray(body.blocks)) {
      return NextResponse.json({ error: "Missing required report fields." }, { status: 400 });
    }

    const scope = await ensureClientExists(client_id);
    if (scope) return scope;

    const supabase = getSupabaseAdmin();
    const now = new Date().toISOString();
    const payload = {
      client_id,
      period_start,
      period_end,
      blocks: body.blocks,
      strategist_notes: body.strategist_notes?.trim() || null,
      status,
      updated_at: now,
    };

    const { data, error } = await supabase.from("reports").insert(payload).select("*").maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ report: data });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
