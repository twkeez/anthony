export type Ga4MonthTotals = {
  sessions: number;
  keyEvents: number;
};

function firstDayOfMonthIso(d = new Date()) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}-01`;
}

/**
 * GA4 Data API — current month through today.
 * Falls back from `keyEvents` to `conversions` if the property rejects the metric.
 */
export async function fetchGa4MonthTotals(params: {
  accessToken: string;
  propertyId: string;
}): Promise<Ga4MonthTotals> {
  const numericId = params.propertyId.replace(/^properties\//, "");
  const resource = `properties/${numericId}`;
  const url = `https://analyticsdata.googleapis.com/v1beta/${resource}:runReport`;

  const body = {
    dateRanges: [{ startDate: firstDayOfMonthIso(), endDate: "today", name: "current" }],
    metrics: [{ name: "sessions" }, { name: "keyEvents" }],
  };

  let res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const fallbackBody = {
      dateRanges: body.dateRanges,
      metrics: [{ name: "sessions" }, { name: "conversions" }],
    };
    res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${params.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(fallbackBody),
    });
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GA4 Data API error ${res.status}: ${text}`);
  }

  const json = (await res.json()) as {
    totals?: Array<{ metricValues?: Array<{ value?: string }> }>;
    rows?: Array<{ metricValues?: Array<{ value?: string }> }>;
  };

  const cells =
    json.totals?.[0]?.metricValues && json.totals[0].metricValues.length > 0
      ? json.totals[0].metricValues
      : json.rows?.[0]?.metricValues && json.rows[0].metricValues.length > 0
        ? json.rows[0].metricValues
        : [];

  const sessions = Number(cells[0]?.value ?? 0);
  const second = Number(cells[1]?.value ?? 0);

  return { sessions, keyEvents: second };
}
