/**
 * Google Business Profile reviews via My Business API v4 (`mybusiness.googleapis.com/v4`).
 * Location metadata can be resolved with Business Information API v1 (`mybusinessbusinessinformation.googleapis.com/v1`).
 *
 * OAuth scope: `https://www.googleapis.com/auth/business.manage`
 */

const MYBUSINESS_V4 = "https://mybusiness.googleapis.com/v4";
const ACCOUNT_MGMT_V1 = "https://mybusinessaccountmanagement.googleapis.com/v1";
const BUSINESS_INFO_V1 = "https://mybusinessbusinessinformation.googleapis.com/v1";

export type GbpReviewApiRow = {
  reviewId: string;
  reviewResourceName: string;
  reviewerDisplayName: string;
  starRating: number;
  comment: string | null;
  replyText: string | null;
  isReplied: boolean;
  reviewTimestamp: string | null;
};

function mapStarRating(raw: string | null | undefined): number {
  const u = (raw ?? "").toUpperCase();
  if (u === "ONE" || u === "STAR_RATING_ONE") return 1;
  if (u === "TWO" || u === "STAR_RATING_TWO") return 2;
  if (u === "THREE" || u === "STAR_RATING_THREE") return 3;
  if (u === "FOUR" || u === "STAR_RATING_FOUR") return 4;
  if (u === "FIVE" || u === "STAR_RATING_FIVE") return 5;
  return 0;
}

/** Parse a v4 `Review` JSON object. */
export function parseGbpReviewJson(raw: Record<string, unknown>): GbpReviewApiRow | null {
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  const reviewId = typeof raw.reviewId === "string" ? raw.reviewId.trim() : "";
  if (!name || !reviewId) return null;

  let starRating = 0;
  if (typeof raw.starRating === "number" && Number.isFinite(raw.starRating)) {
    starRating = Math.round(raw.starRating);
  } else {
    starRating = mapStarRating(
      typeof raw.starRating === "string" ? raw.starRating : String(raw.starRating ?? ""),
    );
  }
  if (starRating < 1 || starRating > 5) return null;

  const reviewer = raw.reviewer;
  let reviewerDisplayName = "";
  if (reviewer && typeof reviewer === "object" && !Array.isArray(reviewer)) {
    const d = (reviewer as Record<string, unknown>).displayName;
    if (typeof d === "string") reviewerDisplayName = d.trim();
  }

  const comment = typeof raw.comment === "string" && raw.comment.trim() !== "" ? raw.comment.trim() : null;

  const reply = raw.reviewReply;
  let replyText: string | null = null;
  if (reply && typeof reply === "object" && !Array.isArray(reply)) {
    const c = (reply as Record<string, unknown>).comment;
    if (typeof c === "string" && c.trim() !== "") replyText = c.trim();
  }

  const createTime = typeof raw.createTime === "string" ? raw.createTime.trim() : null;

  return {
    reviewId,
    reviewResourceName: name,
    reviewerDisplayName: reviewerDisplayName || "Anonymous",
    starRating,
    comment,
    replyText,
    isReplied: replyText != null,
    reviewTimestamp: createTime,
  };
}

/** Build `accounts/{a}/locations/{l}` parent for `reviews.list` from stored `gbp_location_id`. */
export function resolveReviewsListParent(gbpLocationId: string, accountIdFallback?: string | null): string | null {
  const t = gbpLocationId.trim();
  if (t === "") return null;
  if (t.startsWith("accounts/") && t.includes("/locations/")) {
    const idx = t.indexOf("/reviews/");
    if (idx !== -1) return t.slice(0, idx);
    return t.replace(/\/$/, "");
  }
  if (t.startsWith("locations/")) {
    const acc = (accountIdFallback ?? "").trim();
    if (!acc) return null;
    const aid = acc.startsWith("accounts/") ? acc.replace(/^accounts\//, "").split("/")[0] : acc;
    if (!aid) return null;
    return `accounts/${aid}/${t.replace(/^\//, "")}`.replace(/\/$/, "");
  }
  if (/^\d+$/.test(t) && accountIdFallback) {
    const aid = accountIdFallback.replace(/^accounts\//, "").split("/")[0];
    return `accounts/${aid}/locations/${t}`;
  }
  return null;
}

export async function listGbpAccounts(accessToken: string): Promise<{ name: string; accountName: string }[]> {
  const out: { name: string; accountName: string }[] = [];
  let pageToken: string | undefined;
  do {
    const url = new URL(`${ACCOUNT_MGMT_V1}/accounts`);
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`GBP accounts.list ${res.status}: ${text.slice(0, 400)}`);
    }
    const json = (await res.json()) as {
      accounts?: { name?: string; accountName?: string }[];
      nextPageToken?: string;
    };
    for (const a of json.accounts ?? []) {
      const name = typeof a.name === "string" ? a.name.trim() : "";
      if (!name) continue;
      out.push({
        name,
        accountName: typeof a.accountName === "string" ? a.accountName : name,
      });
    }
    pageToken = json.nextPageToken ?? undefined;
  } while (pageToken);
  return out;
}

export type GbpLocationSummary = { name: string; title?: string };

/** List locations for an account (Business Information v1). */
export async function listGbpLocationsForAccount(
  accessToken: string,
  accountResourceName: string,
  pageSize = 100,
): Promise<GbpLocationSummary[]> {
  const parent = accountResourceName.startsWith("accounts/") ? accountResourceName : `accounts/${accountResourceName}`;
  const out: GbpLocationSummary[] = [];
  let pageToken: string | undefined;

  do {
    const url = new URL(`${BUSINESS_INFO_V1}/${parent}/locations`);
    url.searchParams.set("readMask", "name,title");
    url.searchParams.set("pageSize", String(pageSize));
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`GBP locations.list ${res.status}: ${text.slice(0, 400)}`);
    }
    const json = (await res.json()) as {
      locations?: { name?: string; title?: string }[];
      nextPageToken?: string;
    };
    for (const loc of json.locations ?? []) {
      const name = typeof loc.name === "string" ? loc.name.trim() : "";
      if (name) out.push({ name, title: typeof loc.title === "string" ? loc.title : undefined });
    }
    pageToken = json.nextPageToken ?? undefined;
  } while (pageToken);

  return out;
}

/**
 * List reviews for a location (My Business v4).
 * Parent must be `accounts/{id}/locations/{id}`.
 */
export async function listGbpReviewsForLocation(
  accessToken: string,
  locationParent: string,
): Promise<GbpReviewApiRow[]> {
  const parent = locationParent.replace(/\/$/, "");
  const out: GbpReviewApiRow[] = [];
  let pageToken: string | undefined;

  do {
    const qs = new URLSearchParams({ pageSize: "50" });
    if (pageToken) qs.set("pageToken", pageToken);
    const res = await fetch(`${MYBUSINESS_V4}/${parent}/reviews?${qs}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`GBP reviews.list ${res.status}: ${text.slice(0, 400)}`);
    }
    const json = (await res.json()) as {
      reviews?: Record<string, unknown>[];
      nextPageToken?: string;
    };
    for (const r of json.reviews ?? []) {
      const parsed = parseGbpReviewJson(r);
      if (parsed) out.push(parsed);
    }
    pageToken = json.nextPageToken ?? undefined;
  } while (pageToken);

  return out;
}

/** Put or update a reply on a review (My Business v4). */
export async function putGbpReviewReply(accessToken: string, reviewResourceName: string, comment: string): Promise<void> {
  const name = reviewResourceName.replace(/\/$/, "");
  const url = `${MYBUSINESS_V4}/${name}/reply`;
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ comment: comment.trim() }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GBP reply ${res.status}: ${text.slice(0, 400)}`);
  }
}
