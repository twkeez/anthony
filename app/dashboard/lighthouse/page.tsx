import { LighthouseCommandCenter } from "@/components/agencypulse/lighthouse-command-center";
import { fetchLighthouseCommandCenterData } from "@/lib/data/lighthouse-command-center";

export default async function LighthouseCommandCenterPage() {
  const { rows, minPerformanceScore } = await fetchLighthouseCommandCenterData();
  return <LighthouseCommandCenter initialRows={rows} minPerformanceScore={minPerformanceScore} />;
}
