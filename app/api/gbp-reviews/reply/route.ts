import { NextResponse, type NextRequest } from "next/server";

import { getGoogleAccessTokenFromRefresh } from "@/lib/google/access-token";
import { putGbpReviewReply } from "@/lib/google/gbp-reviews-api";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

function isBody(v: unknown): v is { gbp_review_id: string; reply_text: string } {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return typeof o.gbp_review_id === "string" && o.gbp_review_id.trim() !== "" && typeof o.reply_text === "string";
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (!isBody(body)) {
      return NextResponse.json({ error: "invalid_body" }, { status: 400 });
    }
    const id = body.gbp_review_id.trim();
    const replyText = body.reply_text.trim();
    if (replyText.length < 2) {
      return NextResponse.json({ error: "reply_too_short" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data: row, error: fetchErr } = await supabase
      .from("gbp_reviews")
      .select("id, review_resource_name, is_replied")
      .eq("id", id)
      .maybeSingle();

    if (fetchErr) {
      return NextResponse.json({ error: fetchErr.message }, { status: 500 });
    }
    if (!row) {
      return NextResponse.json({ error: "review_not_found" }, { status: 404 });
    }

    const resourceName = String((row as { review_resource_name?: string }).review_resource_name ?? "").trim();
    if (!resourceName) {
      return NextResponse.json({ error: "missing_review_resource_name" }, { status: 400 });
    }

    const accessToken = await getGoogleAccessTokenFromRefresh();
    await putGbpReviewReply(accessToken, resourceName, replyText);

    const now = new Date().toISOString();
    const { error: upErr } = await supabase
      .from("gbp_reviews")
      .update({
        reply_text: replyText,
        is_replied: true,
        last_sync_at: now,
      })
      .eq("id", id);

    if (upErr) {
      return NextResponse.json({ error: upErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
