import { notFound } from "next/navigation";

import { ClientDetailView } from "@/components/agencypulse/client-detail-view";
import { fetchClientById } from "@/lib/data/clients";
import { fetchClientMetrics } from "@/lib/data/metrics";
import { fetchTasksForClient } from "@/lib/data/tasks";

type Props = { params: Promise<{ id: string }> };

export default async function ClientDetailPage({ params }: Props) {
  const { id } = await params;
  const client = await fetchClientById(id);
  if (!client) notFound();

  const [tasks, metrics] = await Promise.all([
    fetchTasksForClient(id),
    fetchClientMetrics(id),
  ]);

  return (
    <ClientDetailView key={id} client={client} initialTasks={tasks} initialMetrics={metrics} />
  );
}
