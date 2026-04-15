import { NextResponse } from "next/server";

import { ensureClientExists } from "@/lib/auth/ensure-client";
import { getGoogleAccessTokenFromRefresh } from "@/lib/google/access-token";
import { submitGscSitemap } from "@/lib/google/gsc-sitemap-submit";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: Ctx) {
  const { id } = await context.params;
  const scope = await ensureClientExists(id);
  if (scope) return scope;

  const supabase = getSupabaseAdmin();

  const { data: clientRow, error: clientErr } = await supabase
    .from("clients")
    .select("search_console_url")
    .eq("id", id)
    .maybeSingle();

  if (clientErr) {
    console.error("sitemap submit:", clientErr);
    return NextResponse.json({ ok: false, error: clientErr.message }, { status: 500 });
  }
  if (!clientRow) {
    return NextResponse.json({ ok: false, error: "Client not found." }, { status: 404 });
  }

  const siteUrl = clientRow.search_console_url?.trim();
  if (!siteUrl) {
    return NextResponse.json(
      { ok: false, error: "Save a Search Console property URL for this client first." },
      { status: 400 },
    );
  }

  const { data: metricsRow, error: metricsErr } = await supabase
    .from("client_metrics")
    .select("sitemap_url")
    .eq("client_id", id)
    .order("metric_month", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (metricsErr) {
    console.error("sitemap submit:", metricsErr);
    return NextResponse.json({ ok: false, error: metricsErr.message }, { status: 500 });
  }

  const feedpath = metricsRow?.sitemap_url?.trim();
  if (!feedpath) {
    return NextResponse.json(
      { ok: false, error: "No sitemap URL yet. Run Sync metrics after Search Console is configured." },
      { status: 400 },
    );
  }

  try {
    const access = await getGoogleAccessTokenFromRefresh();
    await submitGscSitemap(access, siteUrl, feedpath);
    return NextResponse.json({
      ok: true,
      message: "Sitemap resubmitted to Search Console. Re-sync in a few minutes to refresh status.",
    });
  } catch (e) {
    console.error("sitemap submit:", e);
    const message = e instanceof Error ? e.message : String(e);
    const lower = message.toLowerCase();
    const status =
      lower.includes("403") || lower.includes("insufficient") || lower.includes("permission")
        ? 403
        : 500;
    const hint =
      status === 403
        ? "Reconnect Google in the dashboard with Search Console write access (webmasters scope)."
        : undefined;
    return NextResponse.json({ ok: false, error: message, hint }, { status });
  }
}
