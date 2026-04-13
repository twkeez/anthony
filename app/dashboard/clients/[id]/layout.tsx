import type { ReactNode } from "react";
import { notFound } from "next/navigation";

import { ClientBreadcrumbSetter } from "@/lib/context/dashboard-breadcrumb";
import { fetchClientById } from "@/lib/data/clients";

type Props = { children: ReactNode; params: Promise<{ id: string }> };

export default async function ClientDetailLayout({ children, params }: Props) {
  const { id } = await params;
  const client = await fetchClientById(id);
  if (!client) notFound();

  return <ClientBreadcrumbSetter name={client.business_name}>{children}</ClientBreadcrumbSetter>;
}
