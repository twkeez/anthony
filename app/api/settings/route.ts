import { NextResponse, type NextRequest } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { ThresholdRules } from "@/types/client";

function isThresholdRules(v: unknown): v is ThresholdRules {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.flag_ads_spend_no_conversions === "boolean" &&
    typeof o.flag_zero_conversions_any_spend === "boolean" &&
    typeof o.min_performance_score === "number"
  );
}

export async function GET() {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("app_thresholds")
      .select("rules")
      .eq("id", "global")
      .maybeSingle();

    if (error) throw error;
    const rules = data?.rules;
    if (!isThresholdRules(rules)) {
      return NextResponse.json({
        rules: {
          flag_ads_spend_no_conversions: true,
          flag_zero_conversions_any_spend: true,
          min_performance_score: 50,
        } satisfies ThresholdRules,
      });
    }
    return NextResponse.json({ rules });
  } catch (e) {
    const message = e instanceof Error ? e.message : "settings_fetch_failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (!isThresholdRules(body)) {
      return NextResponse.json({ error: "invalid_rules_payload" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from("app_thresholds").upsert(
      {
        id: "global",
        rules: body,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );

    if (error) throw error;
    return NextResponse.json({ ok: true, rules: body });
  } catch (e) {
    const message = e instanceof Error ? e.message : "settings_save_failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
