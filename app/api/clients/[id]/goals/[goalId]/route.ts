import { NextResponse, type NextRequest } from "next/server";

import { ensureClientExists } from "@/lib/auth/ensure-client";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

type Ctx = { params: Promise<{ id: string; goalId: string }> };

type GoalPatchBody = Partial<{
  goal_type: "Acquisition" | "Efficiency" | "Awareness" | "Retention";
  target_value: number;
  metric_target_column: string;
  intent_statement: string;
  evidence_keywords: string[];
  status: "active" | "completed";
  ai_analysis: string | null;
}>;

export async function PATCH(request: NextRequest, context: Ctx) {
  try {
    const { id: clientId, goalId } = await context.params;
    const scope = await ensureClientExists(clientId);
    if (scope) return scope;

    const body = (await request.json()) as GoalPatchBody;

    const patch: Record<string, unknown> = {};
    if (body.goal_type) patch.goal_type = body.goal_type;
    if (body.target_value != null) {
      const n = Number(body.target_value);
      if (!Number.isFinite(n) || n <= 0) {
        return NextResponse.json({ error: "target_value_must_be_positive_number" }, { status: 400 });
      }
      patch.target_value = n;
    }
    if (typeof body.metric_target_column === "string") patch.metric_target_column = body.metric_target_column.trim();
    if (typeof body.intent_statement === "string") patch.intent_statement = body.intent_statement.trim();
    if (Array.isArray(body.evidence_keywords)) {
      patch.evidence_keywords = body.evidence_keywords.map((x) => String(x).trim()).filter((x) => x !== "");
    }
    if (body.status === "active" || body.status === "completed") patch.status = body.status;
    if (body.ai_analysis === null || typeof body.ai_analysis === "string") patch.ai_analysis = body.ai_analysis;

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "no_valid_fields" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("client_goals")
      .update(patch)
      .eq("id", goalId)
      .eq("client_id", clientId)
      .select("*")
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: "goal_not_found" }, { status: 404 });
    return NextResponse.json({ goal: data });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
