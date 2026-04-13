import { google } from "googleapis";

import { normalizeSearchConsoleSiteUrl } from "@/lib/google/gsc-sitemaps";

/**
 * Notifies Google Search Console to process a sitemap again (Search Console API v1).
 * Requires OAuth scope `https://www.googleapis.com/auth/webmasters` (not readonly).
 */
export async function submitGscSitemap(
  accessToken: string,
  siteUrlRaw: string,
  feedpath: string,
): Promise<void> {
  const siteUrl = normalizeSearchConsoleSiteUrl(siteUrlRaw);
  const oauth2 = new google.auth.OAuth2();
  oauth2.setCredentials({ access_token: accessToken });
  const searchconsole = google.searchconsole({ version: "v1", auth: oauth2 });
  await searchconsole.sitemaps.submit({
    siteUrl,
    feedpath: feedpath.trim(),
  });
}
