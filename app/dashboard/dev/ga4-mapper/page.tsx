import { notFound } from "next/navigation";

import { isGa4MapperRouteEnabled } from "@/lib/dev/ga4-mapper-guard";
import type { ClientMapperRow } from "@/lib/dev/ga4-property-match";

import { loadClientsForGa4MapperAction } from "./actions";
import { Ga4MapperClient } from "./ga4-mapper-client";

export const metadata = {
  title: "GA4 mapper · anthony",
  description: "Map GA4 properties to Supabase clients (internal dev tool).",
};

export default async function Ga4MapperPage() {
  if (!isGa4MapperRouteEnabled()) {
    notFound();
  }

  let initialClients: ClientMapperRow[] = [];
  try {
    initialClients = await loadClientsForGa4MapperAction();
  } catch {
    initialClients = [];
  }

  return <Ga4MapperClient initialClients={initialClients} />;
}
