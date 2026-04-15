import type { Metadata } from "next";

import { CommunicationCommandCenter } from "@/components/agencypulse/communication-command-center";
import { fetchCommunicationCommandCenterData } from "@/lib/data/communication-command-center";

export const metadata: Metadata = {
  title: "anthony · Basecamp communication",
  description: "Last message board contact, previews, and overdue Basecamp tasks per client.",
};

export default async function CommunicationCommandCenterPage() {
  const { rows, triage } = await fetchCommunicationCommandCenterData();
  return <CommunicationCommandCenter initialRows={rows} initialTriage={triage} />;
}
