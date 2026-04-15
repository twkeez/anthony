import { OAuth2Client } from "google-auth-library";
import { google } from "googleapis";

import type { Ga4PropertyOption } from "@/lib/dev/ga4-property-match";

export type ListAllGa4PropertiesResult = {
  properties: Ga4PropertyOption[];
  /** Account rows returned from `accountSummaries.list` (each bundles property summaries). */
  accountSummariesCount: number;
};

/**
 * Lists all GA4 properties visible to the OAuth token via Analytics Admin `accountSummaries.list`
 * (accounts + properties in one paginated feed).
 */
export async function listAllGa4PropertiesForAgency(accessToken: string): Promise<ListAllGa4PropertiesResult> {
  const oauth2 = new OAuth2Client();
  oauth2.setCredentials({ access_token: accessToken });
  const admin = google.analyticsadmin({ version: "v1beta", auth: oauth2 });

  const out: Ga4PropertyOption[] = [];
  let accountSummariesCount = 0;
  let pageToken: string | undefined;

  do {
    const res = await admin.accountSummaries.list({
      pageSize: 200,
      pageToken,
    });

    for (const summary of res.data.accountSummaries ?? []) {
      accountSummariesCount += 1;
      for (const ps of summary.propertySummaries ?? []) {
        const resourceName = ps.property ?? "";
        const m = resourceName.match(/^properties\/(\d+)$/);
        if (!m?.[1]) continue;
        const numericId = m[1];
        const displayName = (ps.displayName ?? "").trim() || numericId;
        out.push({
          resourceName,
          displayName,
          numericId,
        });
      }
    }

    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);

  const seen = new Set<string>();
  const deduped: Ga4PropertyOption[] = [];
  for (const p of out) {
    if (seen.has(p.numericId)) continue;
    seen.add(p.numericId);
    deduped.push(p);
  }

  deduped.sort((a, b) => a.displayName.localeCompare(b.displayName));
  return { properties: deduped, accountSummariesCount };
}
