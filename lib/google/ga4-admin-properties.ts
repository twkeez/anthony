import { OAuth2Client } from "google-auth-library";
import { google } from "googleapis";

import type { Ga4PropertyOption } from "@/lib/dev/ga4-property-match";

/**
 * Lists all GA4 properties visible to the OAuth token via Analytics Admin `accountSummaries.list`.
 */
export async function listAllGa4PropertiesForAgency(accessToken: string): Promise<Ga4PropertyOption[]> {
  const oauth2 = new OAuth2Client();
  oauth2.setCredentials({ access_token: accessToken });
  const admin = google.analyticsadmin({ version: "v1beta", auth: oauth2 });

  const out: Ga4PropertyOption[] = [];
  let pageToken: string | undefined;

  do {
    const res = await admin.accountSummaries.list({
      pageSize: 200,
      pageToken,
    });

    for (const summary of res.data.accountSummaries ?? []) {
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
  return deduped;
}
