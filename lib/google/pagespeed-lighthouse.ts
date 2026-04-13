/**
 * Google PageSpeed Insights API v5 — returns Lighthouse category scores (mobile).
 * https://developers.google.com/speed/docs/insights/v5/get-started
 *
 * Uses `GOOGLE_PAGESPEED_API_KEY` (API key restricted by HTTP referrer in GCP is typical).
 */

const PSI_BASE = "https://pagespeedonline.googleapis.com/pagespeedonline/v5/runPagespeed";

export type LighthouseStoredScores = {
  performance: number | null;
  accessibility: number | null;
  seo: number | null;
  bestPractices: number | null;
  /** Resolved audited URL from the API when present. */
  finalUrl: string | null;
};

function score01To100(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return null;
  const pct = n <= 1 ? Math.round(n * 100) : Math.round(Math.min(100, n));
  return pct >= 0 && pct <= 100 ? pct : null;
}

function readCategoryScore(
  categories: Record<string, unknown> | undefined,
  id: "performance" | "accessibility" | "seo" | "best-practices",
): number | null {
  if (!categories || typeof categories !== "object") return null;
  const cat = categories[id] as Record<string, unknown> | undefined;
  if (!cat || typeof cat !== "object") return null;
  return score01To100(cat.score);
}

type PsiJson = {
  lighthouseResult?: {
    categories?: Record<string, unknown>;
    finalUrl?: string;
  };
  error?: { code?: number; message?: string };
  /** Some failures return a top-level string message */
  message?: string;
};

/**
 * Normalizes `clients.website` to an absolute https URL for PSI.
 */
export function normalizeWebsiteForPageSpeed(website: string | null | undefined): string | null {
  const w = website?.trim();
  if (!w) return null;
  if (/^https?:\/\//i.test(w)) return w;
  return `https://${w}`;
}

export async function fetchPageSpeedLighthouseScores(params: {
  url: string;
  apiKey: string;
  signal?: AbortSignal;
}): Promise<{ scores: LighthouseStoredScores; errorMessage: string | null }> {
  const empty: LighthouseStoredScores = {
    performance: null,
    accessibility: null,
    seo: null,
    bestPractices: null,
    finalUrl: null,
  };

  const key = params.apiKey.trim();
  if (!key) {
    return { scores: empty, errorMessage: "missing_api_key" };
  }

  const u = new URL(PSI_BASE);
  u.searchParams.set("url", params.url);
  u.searchParams.set("key", key);
  u.searchParams.set("strategy", "mobile");
  for (const c of ["PERFORMANCE", "ACCESSIBILITY", "SEO", "BEST_PRACTICES"] as const) {
    u.searchParams.append("category", c);
  }

  const res = await fetch(u.toString(), { method: "GET", signal: params.signal, cache: "no-store" });
  const text = await res.text();
  let body: PsiJson;
  try {
    body = JSON.parse(text) as PsiJson;
  } catch {
    return {
      scores: empty,
      errorMessage: `invalid_json_http_${res.status}`,
    };
  }

  if (!res.ok) {
    const msg = body.error?.message ?? body.message ?? text.slice(0, 240);
    return { scores: empty, errorMessage: `http_${res.status}: ${msg}` };
  }

  if (body.error?.message) {
    return { scores: empty, errorMessage: body.error.message };
  }

  const lr = body.lighthouseResult;
  const categories = lr?.categories as Record<string, unknown> | undefined;

  const scores: LighthouseStoredScores = {
    performance: readCategoryScore(categories, "performance"),
    accessibility: readCategoryScore(categories, "accessibility"),
    seo: readCategoryScore(categories, "seo"),
    bestPractices: readCategoryScore(categories, "best-practices"),
    finalUrl: typeof lr?.finalUrl === "string" && lr.finalUrl.trim() ? lr.finalUrl.trim() : params.url,
  };

  const hasAny =
    scores.performance != null ||
    scores.accessibility != null ||
    scores.seo != null ||
    scores.bestPractices != null;

  if (!hasAny) {
    return {
      scores,
      errorMessage: "no_lighthouse_categories_in_response",
    };
  }

  return { scores, errorMessage: null };
}
