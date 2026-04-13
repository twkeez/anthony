import type { Ga4AlertsState } from "@/lib/agency-hub/ga4-analytics-status";
import { EMPTY_GA4_ALERTS } from "@/lib/agency-hub/ga4-analytics-status";

type Ga4ReportResponse = {
  totals?: Array<{ metricValues?: Array<{ value?: string }> }>;
};

function propertyPath(propertyId: string): string {
  const n = propertyId.replace(/^properties\//, "").trim();
  return `properties/${n}`;
}

async function runReport(
  accessToken: string,
  propertyId: string,
  body: Record<string, unknown>,
): Promise<{ ok: false; err: string } | { ok: true; data: Ga4ReportResponse }> {
  const url = `https://analyticsdata.googleapis.com/v1beta/${propertyPath(propertyId)}:runReport`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text();
    return { ok: false, err: `GA4 Data API ${res.status}: ${t.slice(0, 240)}` };
  }
  return { ok: true, data: (await res.json()) as Ga4ReportResponse };
}

function readMetricTotals(data: Ga4ReportResponse): number[] {
  return (data.totals?.[0]?.metricValues ?? []).map((m) => Number(m.value ?? NaN));
}

function ymdUtc(d: Date): string {
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${mo}-${day}`;
}

function intOrNull(n: number): number | null {
  if (!Number.isFinite(n)) return null;
  return Math.round(n);
}

export type Ga4SyncBundle = {
  ga4_sessions: number | null;
  ga4_key_events: number | null;
  ga4_engagement_rate: number | null;
  ga4_alerts: Ga4AlertsState;
};

async function fetch30DayTotals(
  accessToken: string,
  propertyId: string,
): Promise<{ sessions: number | null; keyEvents: number | null; engagementRate: number | null }> {
  const attempts: { metrics: { name: string }[] }[] = [
    { metrics: [{ name: "sessions" }, { name: "keyEvents" }, { name: "engagementRate" }] },
    { metrics: [{ name: "sessions" }, { name: "conversions" }, { name: "engagementRate" }] },
    { metrics: [{ name: "sessions" }, { name: "keyEvents" }] },
    { metrics: [{ name: "sessions" }, { name: "conversions" }] },
  ];

  for (const { metrics } of attempts) {
    const r = await runReport(accessToken, propertyId, {
      dateRanges: [{ startDate: "30daysAgo", endDate: "today" }],
      metrics,
    });
    if (!r.ok) continue;
    const v = readMetricTotals(r.data);
    const sessions = Number.isFinite(v[0]) ? v[0] : null;
    const second = Number.isFinite(v[1]) ? v[1] : null;
    const engagementRate =
      metrics.length >= 3 && Number.isFinite(v[2]) ? Math.min(1, Math.max(0, v[2])) : null;
    return {
      sessions: sessions != null ? intOrNull(sessions) : null,
      keyEvents: second != null ? intOrNull(second) : null,
      engagementRate,
    };
  }
  return { sessions: null, keyEvents: null, engagementRate: null };
}

async function fetchSessionsSingleDay(
  accessToken: string,
  propertyId: string,
  ymd: string,
): Promise<number | null> {
  const r = await runReport(accessToken, propertyId, {
    dateRanges: [{ startDate: ymd, endDate: ymd }],
    metrics: [{ name: "sessions" }],
  });
  if (!r.ok) return null;
  const v = readMetricTotals(r.data)[0];
  return Number.isFinite(v) ? intOrNull(v) : null;
}

async function fetch7DaySessionsAndEvents(
  accessToken: string,
  propertyId: string,
): Promise<{ sessions: number | null; events: number | null }> {
  const rK = await runReport(accessToken, propertyId, {
    dateRanges: [{ startDate: "7daysAgo", endDate: "today" }],
    metrics: [{ name: "sessions" }, { name: "keyEvents" }],
  });
  if (rK.ok) {
    const v = readMetricTotals(rK.data);
    return {
      sessions: Number.isFinite(v[0]) ? intOrNull(v[0]) : null,
      events: Number.isFinite(v[1]) ? intOrNull(v[1]) : null,
    };
  }
  const rC = await runReport(accessToken, propertyId, {
    dateRanges: [{ startDate: "7daysAgo", endDate: "today" }],
    metrics: [{ name: "sessions" }, { name: "conversions" }],
  });
  if (!rC.ok) return { sessions: null, events: null };
  const v = readMetricTotals(rC.data);
  return {
    sessions: Number.isFinite(v[0]) ? intOrNull(v[0]) : null,
    events: Number.isFinite(v[1]) ? intOrNull(v[1]) : null,
  };
}

/**
 * GA4 Data API: trailing 30-day sessions / key events (or conversions), engagement rate, and alert flags.
 * - Traffic cliff: yesterday vs same calendar day last week — RED if sessions drop &gt;80% (yesterday &lt; 20% of comparison).
 * - Conversion ghost: last 7 days — YELLOW if sessions &gt; 100 and key events (or conversions) === 0.
 */
export async function fetchGa4SyncBundle(params: {
  accessToken: string;
  propertyId: string;
}): Promise<Ga4SyncBundle> {
  const id = params.propertyId.trim();
  const accessToken = params.accessToken;

  const yesterday = new Date();
  yesterday.setUTCHours(12, 0, 0, 0);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const sameDayLastWeek = new Date(yesterday);
  sameDayLastWeek.setUTCDate(sameDayLastWeek.getUTCDate() - 7);

  const [t30, sYest, sWeek, w7] = await Promise.all([
    fetch30DayTotals(accessToken, id),
    fetchSessionsSingleDay(accessToken, id, ymdUtc(yesterday)),
    fetchSessionsSingleDay(accessToken, id, ymdUtc(sameDayLastWeek)),
    fetch7DaySessionsAndEvents(accessToken, id),
  ]);

  const alerts: Ga4AlertsState = { ...EMPTY_GA4_ALERTS };

  if (sYest != null && sWeek != null && sWeek > 0 && sYest < 0.2 * sWeek) {
    alerts.isTrafficCliff = true;
  }

  if (w7.sessions != null && w7.sessions > 100 && w7.events != null && w7.events === 0) {
    alerts.isConversionGhost = true;
  }

  return {
    ga4_sessions: t30.sessions,
    ga4_key_events: t30.keyEvents,
    ga4_engagement_rate: t30.engagementRate,
    ga4_alerts: alerts,
  };
}
