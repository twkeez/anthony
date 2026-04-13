import { AdsCommandCenter } from "@/components/agencypulse/ads-command-center";
import { fetchAdsCommandCenterRows } from "@/lib/data/ads-command-center";

export default async function AdsCommandCenterPage() {
  const rows = await fetchAdsCommandCenterRows();
  return <AdsCommandCenter initialRows={rows} />;
}
