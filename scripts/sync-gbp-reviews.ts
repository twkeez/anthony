/**
 * Sync Google Business Profile reviews into `gbp_reviews`.
 *
 * - Resolves each client's `gbp_location_id` to a v4 reviews parent (`accounts/.../locations/...`) using
 *   Business Information API v1 (list locations) when needed.
 * - Fetches reviews via My Business API v4 (`accounts.locations.reviews.list`).
 *
 * OAuth: `https://www.googleapis.com/auth/business.manage` (refresh token in `google_agency_connection`).
 *
 * Env:
 *   - Optional `GOOGLE_BUSINESS_ACCOUNT_ID` — when `gbp_location_id` is only `locations/{id}` or a numeric id.
 *
 * Usage: `npx tsx scripts/sync-gbp-reviews.ts`
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

import { config } from "dotenv";

import { getGoogleAccessTokenFromRefresh } from "@/lib/google/access-token";
import {
  listGbpAccounts,
  listGbpLocationsForAccount,
  listGbpReviewsForLocation,
  resolveReviewsListParent,
  type GbpReviewApiRow,
} from "@/lib/google/gbp-reviews-api";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

config({ path: path.join(root, ".env.local") });

function envAccountFallback(): string | null {
  const a = process.env.GOOGLE_BUSINESS_ACCOUNT_ID?.trim();
  return a && a.length > 0 ? a : null;
}

async function resolveLocationParentForClient(
  accessToken: string,
  gbpLocationId: string,
  accountFallback: string | null,
): Promise<string | null> {
  const direct = resolveReviewsListParent(gbpLocationId, accountFallback);
  if (direct) return direct;

  const t = gbpLocationId.trim();
  const accounts = await listGbpAccounts(accessToken);
  if (accounts.length === 0) {
    console.warn("[sync-gbp-reviews] No Google Business accounts returned.");
    return null;
  }

  for (const acc of accounts) {
    const locs = await listGbpLocationsForAccount(accessToken, acc.name);
    for (const loc of locs) {
      if (loc.name === t || loc.name.endsWith(`/${t.replace(/^locations\//, "")}`)) {
        return loc.name.replace(/\/$/, "");
      }
    }
  }

  return null;
}

function toUpsertRow(clientId: string, r: GbpReviewApiRow, now: string) {
  return {
    client_id: clientId,
    review_id: r.reviewId,
    review_resource_name: r.reviewResourceName,
    reviewer_name: r.reviewerDisplayName,
    star_rating: r.starRating,
    comment: r.comment,
    reply_text: r.replyText,
    is_replied: r.isReplied,
    review_timestamp: r.reviewTimestamp,
    last_sync_at: now,
  };
}

async function main() {
  const accessToken = await getGoogleAccessTokenFromRefresh();
  const supabase = getSupabaseAdmin();
  const accountFallback = envAccountFallback();

  const { data: clients, error: cErr } = await supabase
    .from("clients")
    .select("id, business_name, gbp_location_id")
    .not("gbp_location_id", "is", null);

  if (cErr) throw cErr;

  const rows = (clients ?? []).filter((c) => {
    const g = (c as { gbp_location_id: string | null }).gbp_location_id;
    return g != null && String(g).trim() !== "";
  }) as { id: string; business_name: string | null; gbp_location_id: string }[];

  if (rows.length === 0) {
    console.log("[sync-gbp-reviews] No clients with gbp_location_id.");
    return;
  }

  const now = new Date().toISOString();
  let inserted = 0;

  for (const c of rows) {
    const clientId = String(c.id);
    const gbpId = String(c.gbp_location_id).trim();
    const label = c.business_name ?? clientId;

    let parent: string | null = null;
    try {
      parent = await resolveLocationParentForClient(accessToken, gbpId, accountFallback);
    } catch (e) {
      console.error(`[sync-gbp-reviews] ${label}: resolve location failed:`, e);
      continue;
    }

    if (!parent) {
      console.warn(`[sync-gbp-reviews] ${label}: could not resolve GBP location for "${gbpId}".`);
      continue;
    }

    let reviews: GbpReviewApiRow[] = [];
    try {
      reviews = await listGbpReviewsForLocation(accessToken, parent);
    } catch (e) {
      console.error(`[sync-gbp-reviews] ${label}: reviews.list failed:`, e);
      continue;
    }

    const batch = reviews.map((r) => toUpsertRow(clientId, r, now));
    if (batch.length > 0) {
      const { error: upErr } = await supabase.from("gbp_reviews").upsert(batch, {
        onConflict: "review_resource_name",
      });
      if (upErr) {
        console.error(`[sync-gbp-reviews] ${label}: batch upsert:`, upErr.message);
      } else {
        inserted += batch.length;
      }
    }

    console.log(`[sync-gbp-reviews] ${label}: synced ${reviews.length} review(s) from ${parent}.`);
  }

  console.log(`[sync-gbp-reviews] Done. Upsert attempts: ${inserted}.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
