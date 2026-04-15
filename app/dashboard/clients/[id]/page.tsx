import { notFound } from "next/navigation";

import { ClientDetailView } from "@/components/agencypulse/client-detail-view";
import { fetchClientGoals } from "@/lib/data/client-goals";
import { fetchClientById } from "@/lib/data/clients";
import { fetchClientMetrics } from "@/lib/data/metrics";
import { fetchStaffForStrategistSelect } from "@/lib/data/staff";
import { fetchTasksForClient } from "@/lib/data/tasks";

type Props = { params: Promise<{ id: string }> };

export default async function ClientDetailPage({ params }: Props) {
  const { id } = await params;
  const client = await fetchClientById(id);
  if (!client) notFound();

  const [tasks, metrics, staffOptions, goals] = await Promise.all([
    fetchTasksForClient(id),
    fetchClientMetrics(id),
    fetchStaffForStrategistSelect(),
    fetchClientGoals(id),
  ]);

  return (
    <ClientDetailView
      key={id}
      client={client}
      initialTasks={tasks}
      initialMetrics={metrics}
      initialGoals={goals}
      staffOptions={staffOptions}
    />
  );
}
