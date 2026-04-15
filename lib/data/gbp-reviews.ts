import { createSupabasePublicClient } from "@/lib/supabase/public";
import type { GbpReviewRow } from "@/types/database.types";

function mapGbpReview(raw: Record<string, unknown>): GbpReviewRow {
  return {
    id: String(raw.id),
    client_id: String(raw.client_id),
    review_id: String(raw.review_id ?? ""),
    review_resource_name: String(raw.review_resource_name ?? ""),
    reviewer_name: String(raw.reviewer_name ?? ""),
    star_rating: Math.round(Number(raw.star_rating)),
    comment: raw.comment != null ? String(raw.comment) : null,
    reply_text: raw.reply_text != null ? String(raw.reply_text) : null,
    is_replied: Boolean(raw.is_replied),
    review_timestamp: raw.review_timestamp != null ? String(raw.review_timestamp) : null,
    last_sync_at: String(raw.last_sync_at ?? ""),
  };
}

export async function fetchGbpReviewsForDashboard(): Promise<GbpReviewRow[]> {
  const supabase = createSupabasePublicClient();
  const { data, error } = await supabase
    .from("gbp_reviews")
    .select("*")
    .order("review_timestamp", { ascending: false })
    .limit(500);

  if (error) {
    if (/gbp_reviews|schema cache|does not exist/i.test(error.message ?? "")) return [];
    throw new Error(error.message);
  }
  return (data ?? []).map((row) => mapGbpReview(row as Record<string, unknown>));
}
