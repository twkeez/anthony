import { NextResponse, type NextRequest } from "next/server";

import { ensureClientExists } from "@/lib/auth/ensure-client";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

type Ctx = { params: Promise<{ id: string }> };

type GoalBody = {
  goal_type: "Acquisition" | "Efficiency" | "Awareness" | "Retention";
  target_value: number;
  metric_target_column: string;
  intent_statement: string;
  evidence_keywords?: string[];
  status?: "active" | "completed";
};

export async function POST(request: NextRequest, context: Ctx) {
  try {
    const { id: clientId } = await context.params;
    const scope = await ensureClientExists(clientId);
    if (scope) return scope;

    const body = (await request.json()) as GoalBody;
    if (!body.goal_type || !body.metric_target_column?.trim() || !body.intent_statement?.trim()) {
      return NextResponse.json({ error: "missing_required_goal_fields" }, { status: 400 });
    }
    const target = Number(body.target_value);
    if (!Number.isFinite(target) || target <= 0) {
      return NextResponse.json({ error: "target_value_must_be_positive_number" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("client_goals")
      .insert({
        client_id: clientId,
        goal_type: body.goal_type,
        target_value: target,
        metric_target_column: body.metric_target_column.trim(),
        intent_statement: body.intent_statement.trim(),
        evidence_keywords: Array.isArray(body.evidence_keywords)
          ? body.evidence_keywords.map((x) => String(x).trim()).filter((x) => x !== "")
          : [],
        status: body.status === "completed" ? "completed" : "active",
      })
      .select("*")
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ goal: data });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
