import { notFound } from "next/navigation";

import { isBasecampMapperRouteEnabled } from "@/lib/dev/basecamp-mapper-guard";

import type { ClientBasecampMapperRow } from "@/lib/dev/basecamp-project-match";

import { loadClientsForBasecampMapperAction } from "./actions";
import { BasecampMapperClient } from "./basecamp-mapper-client";

export const metadata = {
  title: "Basecamp mapper · anthony",
  description: "Map Basecamp 2 projects to Supabase clients (internal dev tool).",
};

export default async function BasecampMapperPage() {
  if (!isBasecampMapperRouteEnabled()) {
    notFound();
  }

  let initialClients: ClientBasecampMapperRow[] = [];
  try {
    initialClients = await loadClientsForBasecampMapperAction();
  } catch {
    initialClients = [];
  }

  return <BasecampMapperClient initialClients={initialClients} />;
}
