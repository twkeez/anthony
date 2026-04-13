import {
  EMPTY_GOOGLE_ADS_ALERTS,
  type GoogleAdsAlertsState,
} from "@/lib/agency-hub/google-ads-account-status";
import { readMetricNumber, readMicros, runAdsGaql } from "@/lib/google/ads-metrics";

function rowParts(row: unknown): { metrics: Record<string, unknown>; segments: Record<string, unknown> } {
  if (!row || typeof row !== "object") {
    return { metrics: {}, segments: {} };
  }
  const r = row as Record<string, unknown>;
  const metrics = (r.metrics ?? {}) as Record<string, unknown>;
  const segments = (r.segments ?? {}) as Record<string, unknown>;
  return { metrics, segments };
}

function utcYmd(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Inclusive calendar dates from (yesterday − (n − 1)) through yesterday, UTC. */
function lastNDatesThroughYesterdayUtc(n: number): string[] {
  const end = new Date();
  end.setUTCHours(0, 0, 0, 0);
  end.setUTCDate(end.getUTCDate() - 1);
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(end);
    d.setUTCDate(end.getUTCDate() - i);
    out.push(utcYmd(d));
  }
  return out;
}

/**
 * Runs GAQL-backed checks for Ads Command Center rules and returns flags for `client_metrics.google_ads_alerts`.
 * Failures in individual queries are logged and treated as “no alert” for that rule so month metrics sync can continue.
 */
export async function fetchGoogleAdsAlertsFromGaql(params: {
  accessToken: string;
  customerId: string;
}): Promise<GoogleAdsAlertsState> {
  const out: GoogleAdsAlertsState = { ...EMPTY_GOOGLE_ADS_ALERTS };

  try {
    const flatlineDates = lastNDatesThroughYesterdayUtc(2);
    const flatStart = flatlineDates[0]!;
    const flatEnd = flatlineDates[1]!;
    const { results } = await runAdsGaql({
      accessToken: params.accessToken,
      customerId: params.customerId,
      query: `
        SELECT metrics.impressions
        FROM campaign
        WHERE segments.date BETWEEN '${flatStart}' AND '${flatEnd}'
      `,
    });
    let impr = 0;
    for (const row of results) {
      impr += readMetricNumber(rowParts(row).metrics, ["impressions"]);
    }
    out.isFlatlined = results.length === 0 || impr === 0;
  } catch (e) {
    console.warn("[google_ads_alerts] flatline GAQL failed:", e);
  }

  try {
    const { results } = await runAdsGaql({
      accessToken: params.accessToken,
      customerId: params.customerId,
      query: `
        SELECT ad_group_ad.resource_name
        FROM ad_group_ad
        WHERE ad_group_ad.policy_summary.approval_status = 'DISAPPROVED'
        LIMIT 1
      `,
    });
    out.hasDisapprovedAds = results.length > 0;
  } catch (e) {
    console.warn("[google_ads_alerts] policy GAQL failed:", e);
  }

  try {
    const dates = lastNDatesThroughYesterdayUtc(15);
    const start = dates[0]!;
    const end = dates[dates.length - 1]!;
    const { results } = await runAdsGaql({
      accessToken: params.accessToken,
      customerId: params.customerId,
      query: `
        SELECT segments.date, metrics.cost_micros
        FROM customer
        WHERE segments.date BETWEEN '${start}' AND '${end}'
      `,
    });
    const spendByDate = new Map<string, number>();
    for (const row of results) {
      const { metrics, segments } = rowParts(row);
      const day =
        typeof segments.date === "string"
          ? segments.date
          : segments.date != null
            ? String(segments.date)
            : "";
      if (!day) continue;
      const prev = spendByDate.get(day) ?? 0;
      spendByDate.set(day, prev + readMicros(metrics, ["costMicros", "cost_micros"]) / 1_000_000);
    }
    const prior = dates.slice(0, 14);
    const yesterday = dates[14]!;
    const priorSpends = prior.map((d) => spendByDate.get(d) ?? 0);
    const avgPrior = priorSpends.reduce((a, b) => a + b, 0) / 14;
    const yesterdaySpend = spendByDate.get(yesterday) ?? 0;
    out.spendDrop = avgPrior > 0 && yesterdaySpend < 0.5 * avgPrior;
  } catch (e) {
    console.warn("[google_ads_alerts] spend-drop GAQL failed:", e);
  }

  try {
    const { results } = await runAdsGaql({
      accessToken: params.accessToken,
      customerId: params.customerId,
      query: `
        SELECT metrics.clicks, metrics.conversions
        FROM customer
        WHERE segments.date DURING LAST_7_DAYS
      `,
    });
    let clicks = 0;
    let conv = 0;
    for (const row of results) {
      const { metrics } = rowParts(row);
      clicks += readMetricNumber(metrics, ["clicks"]);
      conv += readMetricNumber(metrics, ["conversions"]);
    }
    out.brokenTracking = clicks > 50 && conv === 0;
  } catch (e) {
    console.warn("[google_ads_alerts] broken-tracking GAQL failed:", e);
  }

  return out;
}
