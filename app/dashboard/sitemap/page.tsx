import { SitemapCommandCenter } from "@/components/agencypulse/sitemap-command-center";
import { fetchSitemapCommandCenterRows } from "@/lib/data/sitemap-command-center";

export const metadata = {
  title: "Sitemaps · anthony",
  description: "Search Console sitemap and organic snapshot across clients.",
};

export default async function SitemapCommandCenterPage() {
  const rows = await fetchSitemapCommandCenterRows();
  return <SitemapCommandCenter initialRows={rows} />;
}
