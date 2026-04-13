"use server";

import { listAllBasecampProjects } from "@/lib/basecamp/basecamp-api";
import { assertBasecampMapperAllowed } from "@/lib/dev/basecamp-mapper-guard";
import {
  type BasecampProjectOption,
  type ClientBasecampMapperRow,
  suggestBasecampMatch,
} from "@/lib/dev/basecamp-project-match";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type BasecampMapperClientRow = ClientBasecampMapperRow & {
  suggestedProjectId: string | null;
};

export async function fetchBasecampProjectsForMapperAction(): Promise<{
  projects: BasecampProjectOption[];
  clients: BasecampMapperClientRow[];
}> {
  assertBasecampMapperAllowed();

  const projectsRaw = await listAllBasecampProjects();
  const projects: BasecampProjectOption[] = projectsRaw.map((p) => ({ id: p.id, name: p.name }));

  const supabase = getSupabaseAdmin();
  const { data: clientRows, error } = await supabase
    .from("clients")
    .select("id, business_name, website, basecamp_project_id")
    .order("business_name", { ascending: true });

  if (error) throw new Error(error.message);

  const clients: BasecampMapperClientRow[] = (clientRows ?? []).map((row) => {
    const c: ClientBasecampMapperRow = {
      id: String((row as { id: string }).id),
      business_name: String((row as { business_name: string | null }).business_name ?? ""),
      website: (row as { website: string | null }).website ?? null,
      basecamp_project_id: (row as { basecamp_project_id: string | null }).basecamp_project_id ?? null,
    };
    const suggested = suggestBasecampMatch(c, projects);
    return {
      ...c,
      suggestedProjectId: suggested?.id ?? null,
    };
  });

  return { projects, clients };
}

export type BasecampMapperSaveRow = { clientId: string; basecampProjectId: string };

export async function saveBasecampMapperMatchesAction(rows: BasecampMapperSaveRow[]): Promise<{ updated: number }> {
  assertBasecampMapperAllowed();

  if (!Array.isArray(rows) || rows.length === 0) {
    return { updated: 0 };
  }

  const supabase = getSupabaseAdmin();
  let updated = 0;

  for (const row of rows) {
    const id = String(row.clientId).trim();
    if (!id) continue;
    const raw = row.basecampProjectId?.trim() ?? "";
    const value = raw === "" ? null : raw;

    const { error } = await supabase.from("clients").update({ basecamp_project_id: value }).eq("id", id);
    if (error) throw new Error(`${id}: ${error.message}`);
    updated += 1;
  }

  return { updated };
}

/** Server-only: load clients for initial paint (no Basecamp call). */
export async function loadClientsForBasecampMapperAction(): Promise<ClientBasecampMapperRow[]> {
  assertBasecampMapperAllowed();

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("clients")
    .select("id, business_name, website, basecamp_project_id")
    .order("business_name", { ascending: true });

  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => ({
    id: String((row as { id: string }).id),
    business_name: String((row as { business_name: string | null }).business_name ?? ""),
    website: (row as { website: string | null }).website ?? null,
    basecamp_project_id: (row as { basecamp_project_id: string | null }).basecamp_project_id ?? null,
  }));
}
