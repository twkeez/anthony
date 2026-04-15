import { NextResponse } from "next/server";

import { ensureClientExists } from "@/lib/auth/ensure-client";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { currentMetricMonthStart, syncCommunicationAlertsFromBasecamp } from "@/lib/sync/communication-sync";
import { syncClientMetrics } from "@/lib/sync/client-metrics-sync";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: Ctx) {
  const { id } = await context.params;
  const scope = await ensureClientExists(id);
  if (scope) return scope;

  try {
    const result = await syncClientMetrics(id);
    await syncCommunicationAlertsFromBasecamp();

    const supabase = getSupabaseAdmin();
    const { data: row } = await supabase
      .from("client_metrics")
      .select("communication_alerts")
      .eq("client_id", id)
      .eq("metric_month", currentMetricMonthStart())
      .maybeSingle();

    const communication_alerts =
      (row as { communication_alerts: unknown } | null)?.communication_alerts ?? result.communication_alerts;

    return NextResponse.json({
      ok: true,
      metrics: { ...result, communication_alerts },
    });
  } catch (e) {
    console.error("SYNC CRASH:", e);
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
