import { google } from "googleapis";

import { normalizeSearchConsoleSiteUrl } from "@/lib/google/gsc-sitemaps";
import type { TopOrganicQuery } from "@/types/database.types";

export type GscOrganicSearchSnapshot = {
  organic_clicks: number | null;
  organic_impressions: number | null;
  top_organic_queries: TopOrganicQuery[] | null;
};

/** Inclusive last 30 UTC calendar days, ending yesterday (avoids incomplete “today”). GSC accepts YYYY-MM-DD. */
function last30DayRange(): { startDate: string; endDate: string } {
  const end = new Date();
  end.setUTCDate(end.getUTCDate() - 1);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 29);
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
}

/**
 * Search Console Search Analytics (web) — totals + top queries by clicks.
 * https://developers.google.com/webmaster-tools/v1/searchanalytics/query
 */
export async function fetchGscSearchAnalyticsSnapshot(
  accessToken: string,
  siteUrlRaw: string,
): Promise<GscOrganicSearchSnapshot> {
  const siteUrl = normalizeSearchConsoleSiteUrl(siteUrlRaw);
  const { startDate, endDate } = last30DayRange();

  const oauth2 = new google.auth.OAuth2();
  oauth2.setCredentials({ access_token: accessToken });
  const searchconsole = google.searchconsole({ version: "v1", auth: oauth2 });

  const [totalsRes, queriesRes] = await Promise.all([
    searchconsole.searchanalytics.query({
      siteUrl,
      requestBody: {
        startDate,
        endDate,
        searchType: "web",
        rowLimit: 1,
      },
    }),
    searchconsole.searchanalytics.query({
      siteUrl,
      requestBody: {
        startDate,
        endDate,
        searchType: "web",
        dimensions: ["query"],
        rowLimit: 100,
      },
    }),
  ]);

  const totalRow = totalsRes.data?.rows?.[0];
  const organic_clicks =
    totalRow == null
      ? null
      : Math.round(Number.isFinite(Number(totalRow.clicks)) ? Number(totalRow.clicks) : 0);
  const organic_impressions =
    totalRow == null
      ? null
      : Math.round(Number.isFinite(Number(totalRow.impressions)) ? Number(totalRow.impressions) : 0);

  const top_organic_queries: TopOrganicQuery[] = (queriesRes.data?.rows ?? [])
    .map((r) => ({
      query: String(r.keys?.[0] ?? "").trim(),
      clicks: Math.round(Number(r.clicks ?? 0)),
      impressions: Math.round(Number(r.impressions ?? 0)),
    }))
    .filter((r) => r.query.length > 0)
    .sort((a, b) => b.clicks - a.clicks)
    .slice(0, 5);

  return {
    organic_clicks,
    organic_impressions,
    top_organic_queries: top_organic_queries.length ? top_organic_queries : null,
  };
}
