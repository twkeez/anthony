import { Ga4CommandCenter } from "@/components/agencypulse/ga4-command-center";
import { fetchGa4CommandCenterRows } from "@/lib/data/ga4-command-center";

export default async function Ga4CommandCenterPage() {
  const rows = await fetchGa4CommandCenterRows();
  return <Ga4CommandCenter initialRows={rows} />;
}
