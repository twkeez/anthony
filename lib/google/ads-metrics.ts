/**
 * REST version path segment. Google only keeps a small set of major versions
 * live (see sunset table); removed versions return generic HTML 404 (“Robot”).
 * Do not pin to v17/v18/v19 — use a currently supported version (e.g. v23).
 * https://developers.google.com/google-ads/api/docs/sunset-dates
 */
const ADS_API_SUBPATH = "v23";

/** Standard non-stream search — must use `googleAds:search` (colon), not `googleAds/search`. */
const ADS_SEARCH_RPC = "googleAds:search";

/** Canonical REST origin. */
const ADS_CANONICAL_ORIGIN = "https://googleads.googleapis.com";

type DateRangeMacro = "THIS_MONTH" | "LAST_MONTH";

/** Google documents the developer token as a 22-character alphanumeric string. */
const ADS_DEVELOPER_TOKEN_EXPECTED_LEN = 22;

/**
 * Reads the Ads developer token from env. Strips wrapping quotes and **all**
 * whitespace (line breaks inside the value break the header).
 */
function requireAdsDeveloperToken(): string {
  const raw = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  if (raw === undefined || raw === null) {
    throw new Error(
      "GOOGLE_ADS_DEVELOPER_TOKEN is missing in .env.local. Copy it from Google Ads: Tools → API Center (https://ads.google.com/aw/apicenter).",
    );
  }
  let v = raw.trim().replace(/^["']/, "").replace(/["']$/, "");
  v = v.replace(/\s+/g, "");
  if (!v) {
    throw new Error(
      "GOOGLE_ADS_DEVELOPER_TOKEN is empty after trimming. Copy the token from API Center with no spaces or line breaks.",
    );
  }
  if (v.length !== ADS_DEVELOPER_TOKEN_EXPECTED_LEN) {
    console.warn(
      `[Google Ads] GOOGLE_ADS_DEVELOPER_TOKEN length is ${v.length} (Google documents ${ADS_DEVELOPER_TOKEN_EXPECTED_LEN} chars). ` +
        "If the API returns DEVELOPER_TOKEN_INVALID, re-copy from API Center or remove stray characters.",
    );
  } else if (!/^[0-9A-Za-z]+$/.test(v)) {
    console.warn(
      "[Google Ads] Developer token contains non-alphanumeric characters; API Center tokens are usually letters+digits only.",
    );
  }
  if (process.env.NODE_ENV === "development") {
    const tail = v.length >= 4 ? v.slice(-4) : "----";
    console.log(
      `[Google Ads] developer_token from env: length=${v.length} suffix …${tail} (confirm last 4 match API Center for this MCC)`,
    );
  }
  return v;
}

function adsHttpErrorMessage(status: number, context: string, body: string): string {
  let msg = `Ads API Error ${status} (${context}): ${body}`;
  if (body.includes("DEVELOPER_TOKEN_INVALID")) {
    msg +=
      "\n\nDeveloper token rejected (DEVELOPER_TOKEN_INVALID). Checklist:\n" +
      "1) Copy the token again from https://ads.google.com/aw/apicenter (manager account, not a client-only login).\n" +
      "2) Token should be 22 letters/digits, one line in .env.local — no quotes wrapping the value unless they are part of the token.\n" +
      "3) Test access only works with test accounts; production customers need Basic or Standard access on that token.\n" +
      "4) OAuth client must be from a GCP project with Google Ads API enabled: https://developers.google.com/google-ads/api/docs/oauth/cloud-project\n" +
      "5) That GCP project must not have been used before with a different developer token (Google allows one token per Cloud project).";
  }
  return msg;
}

export type AdsMonthTotals = {
  spend: number;
  conversions: number;
  clicks: number;
  impressions: number;
  /** Aggregate CTR in 0–1 range (clicks / impressions when impressions > 0). */
  ctr: number;
  /** Average CPC in account currency (spend / clicks when clicks > 0). */
  averageCpc: number;
  /** Search impression share (0–1), weighted by daily impressions when available. */
  searchImpressionShare: number;
  searchRankLostImpressionShare: number;
  searchBudgetLostImpressionShare: number;
  /** Absolute top-of-page rate for Search (0–1); API field `search_absolute_top_impression_share`. */
  searchAbsTopImpressionShare: number;
};

/**
 * Normalizes the 10-digit customer id for the REST path.
 */
export function parseAdsCustomerIdForUrl(input: string): string {
  const digits = input.replace(/-/g, "").replace(/customers\//g, "").trim();
  if (!/^\d{10}$/.test(digits)) {
    throw new Error(`Invalid Google Ads Customer ID: ${input}`);
  }
  return digits;
}

export function readMetricNumber(m: Record<string, unknown>, keys: string[]): number {
  for (const key of keys) {
    const raw = m[key];
    if (raw === undefined || raw === null || raw === "") continue;
    const n = typeof raw === "string" ? Number.parseFloat(raw) : Number(raw);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

/**
 * Reads a ratio field from the API. Google usually returns 0–1; if 1–100, treats as percent / 100.
 */
function readOptionalRatio01(m: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const raw = m[key];
    if (raw === undefined || raw === null || raw === "") continue;
    let n = typeof raw === "string" ? Number.parseFloat(raw) : Number(raw);
    if (!Number.isFinite(n)) continue;
    if (n > 1 && n <= 100) n /= 100;
    if (n > 100) n = 1;
    if (n < 0) n = 0;
    return n;
  }
  return undefined;
}

/**
 * Rolls up daily ratio metrics by impressions-weighted mean; falls back to simple mean of days
 * where the ratio is present (handles sparse Search data).
 */
function aggregateRatioByImpressions(
  results: unknown[],
  metricKeys: string[],
): number {
  let weighted = 0;
  let wDen = 0;
  let sum = 0;
  let count = 0;

  for (const row of results) {
    if (!row || typeof row !== "object") continue;
    const m = ((row as Record<string, unknown>).metrics || {}) as Record<string, unknown>;
    const ratio = readOptionalRatio01(m, metricKeys);
    if (ratio === undefined) continue;
    sum += ratio;
    count += 1;
    const impr = readMetricNumber(m, ["impressions"]);
    if (impr > 0) {
      weighted += ratio * impr;
      wDen += impr;
    }
  }

  if (wDen > 0) return weighted / wDen;
  if (count > 0) return sum / count;
  return 0;
}

/** Money / micros fields in REST may be string micros or `{ micros: string }`. */
export function readMicros(m: Record<string, unknown>, keys: string[]): number {
  for (const key of keys) {
    const raw = m[key];
    if (raw === undefined || raw === null) continue;
    if (typeof raw === "object" && raw !== null && "micros" in raw) {
      const micros = (raw as { micros?: string }).micros;
      if (micros != null && micros !== "") {
        const n = Number.parseFloat(String(micros));
        if (Number.isFinite(n)) return n;
      }
      continue;
    }
    if (typeof raw === "string" || typeof raw === "number") {
      const n = typeof raw === "string" ? Number.parseFloat(raw) : Number(raw);
      if (Number.isFinite(n)) return n;
    }
  }
  return 0;
}

/**
 * Runs arbitrary GAQL (e.g. LAST_7_DAYS) against a customer. Uses the same auth headers as month sync.
 */
export async function runAdsGaql(params: {
  accessToken: string;
  customerId: string;
  query: string;
}): Promise<{ results: unknown[] }> {
  const token = params.accessToken?.trim() ?? "";
  if (!token) {
    throw new Error(
      "Google OAuth access token is empty. Reconnect Google integration or verify the refresh token is stored.",
    );
  }
  const cid = parseAdsCustomerIdForUrl(params.customerId);
  const devToken = requireAdsDeveloperToken();
  const url = `${ADS_CANONICAL_ORIGIN}/${ADS_API_SUBPATH}/customers/${cid}/${ADS_SEARCH_RPC}`;
  const loginIdRaw = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID?.trim();
  const loginId = loginIdRaw ? parseAdsCustomerIdForUrl(loginIdRaw) : undefined;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "developer-token": devToken,
    "Content-Type": "application/json",
  };
  if (loginId) {
    headers["login-customer-id"] = loginId;
  }

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ query: params.query.trim() }),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(adsHttpErrorMessage(res.status, "GAQL", text));
  }

  const data = JSON.parse(text) as { results?: unknown[] };
  return { results: data.results ?? [] };
}

/**
 * Aggregates results from the Google Ads JSON response (daily rows).
 * CTR and average CPC are derived from rolled-up impressions / clicks / spend.
 */
function aggregateResults(payload: { results?: Array<{ metrics?: Record<string, unknown> }> }): AdsMonthTotals {
  const acc = { micros: 0, conv: 0, clicks: 0, impressions: 0 };
  const results = payload.results ?? [];

  for (const row of results) {
    const m = (row.metrics ?? {}) as Record<string, unknown>;
    acc.micros += readMicros(m, ["costMicros", "cost_micros"]);
    acc.conv += readMetricNumber(m, ["conversions"]);
    acc.clicks += readMetricNumber(m, ["clicks"]);
    acc.impressions += readMetricNumber(m, ["impressions"]);
  }

  const spend = acc.micros / 1_000_000;
  const ctr = acc.impressions > 0 ? acc.clicks / acc.impressions : 0;
  const averageCpc = acc.clicks > 0 ? spend / acc.clicks : 0;

  const searchImpressionShare = aggregateRatioByImpressions(results, [
    "searchImpressionShare",
    "search_impression_share",
  ]);
  const searchRankLostImpressionShare = aggregateRatioByImpressions(results, [
    "searchRankLostImpressionShare",
    "search_rank_lost_impression_share",
  ]);
  const searchBudgetLostImpressionShare = aggregateRatioByImpressions(results, [
    "searchBudgetLostImpressionShare",
    "search_budget_lost_impression_share",
  ]);
  // Google GAQL name is `search_absolute_top_impression_share` (not `search_abs_top_impression_share`).
  const searchAbsTopImpressionShare = aggregateRatioByImpressions(results, [
    "searchAbsoluteTopImpressionShare",
    "search_absolute_top_impression_share",
  ]);

  return {
    spend,
    conversions: acc.conv,
    clicks: acc.clicks,
    impressions: acc.impressions,
    ctr,
    averageCpc,
    searchImpressionShare,
    searchRankLostImpressionShare,
    searchBudgetLostImpressionShare,
    searchAbsTopImpressionShare,
  };
}

/**
 * Executes the actual fetch request to Google Ads.
 */
async function runCustomerSearch(params: {
  accessToken: string;
  customerId: string;
  loginCustomerId?: string;
  dateRange: DateRangeMacro;
}): Promise<{ resultsCount: number; totals: AdsMonthTotals }> {
  const devToken = requireAdsDeveloperToken();
  const url = `${ADS_CANONICAL_ORIGIN}/${ADS_API_SUBPATH}/customers/${params.customerId}/${ADS_SEARCH_RPC}`;

  console.log("[FINAL_URL_DEBUG] Requesting:", url);
  console.log("[FINAL_URL_DEBUG] Login-ID Header:", params.loginCustomerId || "NONE");

  // `search_absolute_top_impression_share` is not valid on `customer` (PROHIBITED_METRIC_IN_SELECT_OR_WHERE_CLAUSE);
  // it is requested in a follow-up `campaign` query below.
  const gaqlQuery = `
    SELECT
      metrics.cost_micros,
      metrics.conversions,
      metrics.clicks,
      metrics.impressions,
      metrics.ctr,
      metrics.average_cpc,
      metrics.search_impression_share,
      metrics.search_rank_lost_impression_share,
      metrics.search_budget_lost_impression_share,
      segments.date
    FROM customer
    WHERE segments.date DURING ${params.dateRange}
  `.trim();

  const headers: Record<string, string> = {
    Authorization: `Bearer ${params.accessToken}`,
    "developer-token": devToken,
    "Content-Type": "application/json",
  };
  const login = params.loginCustomerId?.trim();
  if (login) {
    headers["login-customer-id"] = login;
  }

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ query: gaqlQuery }),
  });

  const text = await res.text();
  
  if (!res.ok) {
    throw new Error(adsHttpErrorMessage(res.status, params.dateRange, text));
  }

  const data = JSON.parse(text);
  const totals = aggregateResults(data);
  const resultsCount = data.results?.length || 0;

  try {
    totals.searchAbsTopImpressionShare = await fetchSearchAbsTopShareFromCampaigns({
      accessToken: params.accessToken,
      customerId: params.customerId,
      loginCustomerId: params.loginCustomerId,
      dateRange: params.dateRange,
    });
  } catch (e) {
    console.warn(
      "[Google Ads] campaign-level search_absolute_top_impression_share fetch failed (non-fatal):",
      e instanceof Error ? e.message : e,
    );
  }

  return { resultsCount, totals };
}

/**
 * `metrics.search_absolute_top_impression_share` must be queried from `campaign` (or lower), not `customer`.
 */
async function fetchSearchAbsTopShareFromCampaigns(params: {
  accessToken: string;
  customerId: string;
  loginCustomerId?: string;
  dateRange: DateRangeMacro;
}): Promise<number> {
  const devToken = requireAdsDeveloperToken();
  const url = `${ADS_CANONICAL_ORIGIN}/${ADS_API_SUBPATH}/customers/${params.customerId}/${ADS_SEARCH_RPC}`;

  const gaqlQuery = `
    SELECT
      metrics.search_absolute_top_impression_share,
      metrics.impressions,
      segments.date
    FROM campaign
    WHERE segments.date DURING ${params.dateRange}
  `.trim();

  const headers: Record<string, string> = {
    Authorization: `Bearer ${params.accessToken}`,
    "developer-token": devToken,
    "Content-Type": "application/json",
  };
  const login = params.loginCustomerId?.trim();
  if (login) {
    headers["login-customer-id"] = login;
  }

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ query: gaqlQuery }),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(adsHttpErrorMessage(res.status, params.dateRange, text));
  }

  const data = JSON.parse(text) as { results?: Array<{ metrics?: Record<string, unknown> }> };
  return aggregateRatioByImpressions(data.results ?? [], [
    "searchAbsoluteTopImpressionShare",
    "search_absolute_top_impression_share",
  ]);
}

/**
 * Primary entry point for syncing Ads metrics.
 */
export async function fetchAdsMonthTotals(params: {
  accessToken: string;
  customerId: string;
}): Promise<AdsMonthTotals> {
  const token = params.accessToken?.trim() ?? "";
  if (!token) {
    throw new Error(
      "Google OAuth access token is empty. Reconnect Google integration or verify the refresh token is stored.",
    );
  }

  const cid = parseAdsCustomerIdForUrl(params.customerId);
  const loginIdRaw = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID?.trim();
  const loginId = loginIdRaw ? parseAdsCustomerIdForUrl(loginIdRaw) : undefined;

  console.log(`[Google Ads] Starting sync for ${cid}...`);

  // Try current month first
  const thisMonth = await runCustomerSearch({
    accessToken: token,
    customerId: cid,
    loginCustomerId: loginId,
    dateRange: "THIS_MONTH",
  });

  // If no data, fallback to last month
  if (thisMonth.resultsCount === 0) {
    console.log("[Google Ads] No data for THIS_MONTH, attempting LAST_MONTH fallback.");
    const lastMonth = await runCustomerSearch({
      accessToken: token,
      customerId: cid,
      loginCustomerId: loginId,
      dateRange: "LAST_MONTH",
    });
    return lastMonth.totals;
  }

  return thisMonth.totals;
}
