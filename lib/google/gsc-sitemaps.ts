import { google } from "googleapis";

export type GscSitemapSnapshot = {
  sitemap_url: string | null;
  sitemap_status: string | null;
  sitemap_last_downloaded: string | null;
};

type WmxSitemap = {
  path?: string | null;
  lastSubmitted?: string | null;
  lastDownloaded?: string | null;
  isPending?: boolean | null;
  isSitemapsIndex?: boolean | null;
  type?: string | null;
  errors?: string | null;
  warnings?: string | null;
};

/**
 * Normalizes the Search Console "site URL" (must match the property in GSC exactly enough for the API).
 * Accepts `https://www.example.com/`, `sc-domain:example.com`, or bare host.
 */
export function normalizeSearchConsoleSiteUrl(raw: string): string {
  const t = raw.trim();
  if (!t) throw new Error("Search Console site URL is empty.");
  if (t.startsWith("sc-domain:")) return t;
  if (/^https?:\/\//i.test(t)) {
    const u = new URL(t);
    const origin = u.origin;
    const path = u.pathname && u.pathname !== "/" ? u.pathname.replace(/\/+$/, "") : "";
    return path ? `${origin}${path}/` : `${origin}/`;
  }
  return `https://${t.replace(/^\/+/, "").replace(/\/+$/, "")}/`;
}

function parseCount(v: string | null | undefined): number {
  if (v == null || v === "") return 0;
  const n = Number.parseInt(String(v), 10);
  return Number.isFinite(n) ? n : 0;
}

function mapSitemapStatus(s: WmxSitemap): string {
  const errN = parseCount(s.errors ?? undefined);
  if (errN > 0) return "Error";
  if (s.isPending === true) return "Pending";
  if (s.lastDownloaded) return "Success";
  if (s.lastSubmitted) return "Submitted";
  return "Error";
}

function pickPrimarySitemap(entries: WmxSitemap[]): WmxSitemap | null {
  if (!entries.length) return null;
  const scored = entries.map((e, i) => {
    const p = (e.path ?? "").toLowerCase();
    let score = 0;
    if (p.includes("sitemap.xml")) score += 100;
    if (e.isSitemapsIndex === true || String(e.type ?? "").toLowerCase().includes("index")) score += 20;
    if (e.lastDownloaded) score += 10;
    if (e.lastSubmitted) score += 5;
    return { e, score, i };
  });
  scored.sort((a, b) => b.score - a.score || a.i - b.i);
  return scored[0]?.e ?? null;
}

/**
 * Uses Webmasters API v3 (`webmasters.readonly` scope) — `sitemaps.list` for the property.
 * https://developers.google.com/webmaster-tools/v1/sitemaps
 */
export async function fetchGscSitemapSnapshot(
  accessToken: string,
  siteUrlRaw: string,
): Promise<GscSitemapSnapshot> {
  const siteUrl = normalizeSearchConsoleSiteUrl(siteUrlRaw);
  const oauth2 = new google.auth.OAuth2();
  oauth2.setCredentials({ access_token: accessToken });
  const webmasters = google.webmasters({ version: "v3", auth: oauth2 });

  const { data } = await webmasters.sitemaps.list({
    siteUrl,
  });

  const list = (data?.sitemap ?? []) as WmxSitemap[];
  const primary = pickPrimarySitemap(list);
  if (!primary?.path) {
    return { sitemap_url: null, sitemap_status: null, sitemap_last_downloaded: null };
  }

  const lastDl = primary.lastDownloaded ? new Date(primary.lastDownloaded).toISOString() : null;

  return {
    sitemap_url: primary.path,
    sitemap_status: mapSitemapStatus(primary),
    sitemap_last_downloaded: lastDl,
  };
}
