"use server";

import { assertGa4MapperAllowed } from "@/lib/dev/ga4-mapper-guard";
import {
  type ClientMapperRow,
  type Ga4PropertyOption,
  normalizeGa4StoredId,
  suggestGa4Match,
} from "@/lib/dev/ga4-property-match";
import { getGoogleAccessTokenFromRefresh } from "@/lib/google/access-token";
import { listAllGa4PropertiesForAgency } from "@/lib/google/ga4-admin-properties";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type Ga4MapperClientRow = ClientMapperRow & {
  suggestedNumericId: string | null;
};

export async function fetchGa4PropertiesForMapperAction(): Promise<{
  properties: Ga4PropertyOption[];
  clients: Ga4MapperClientRow[];
}> {
  assertGa4MapperAllowed();

  const accessToken = await getGoogleAccessTokenFromRefresh();
  const properties = await listAllGa4PropertiesForAgency(accessToken);

  const supabase = getSupabaseAdmin();
  const { data: clientRows, error } = await supabase
    .from("clients")
    .select("id, business_name, website, ga4_property_id")
    .order("business_name", { ascending: true });

  if (error) throw new Error(error.message);

  const clients: Ga4MapperClientRow[] = (clientRows ?? []).map((row) => {
    const c: ClientMapperRow = {
      id: String((row as { id: string }).id),
      business_name: String((row as { business_name: string | null }).business_name ?? ""),
      website: (row as { website: string | null }).website ?? null,
      ga4_property_id: (row as { ga4_property_id: string | null }).ga4_property_id ?? null,
    };
    const suggested = suggestGa4Match(c, properties);
    return {
      ...c,
      suggestedNumericId: suggested?.numericId ?? null,
    };
  });

  return { properties, clients };
}

export type Ga4MapperSaveRow = { clientId: string; ga4PropertyId: string };

export async function saveGa4MapperMatchesAction(rows: Ga4MapperSaveRow[]): Promise<{ updated: number }> {
  assertGa4MapperAllowed();

  if (!Array.isArray(rows) || rows.length === 0) {
    return { updated: 0 };
  }

  const supabase = getSupabaseAdmin();
  let updated = 0;

  for (const row of rows) {
    const id = String(row.clientId).trim();
    if (!id) continue;
    const raw = row.ga4PropertyId?.trim() ?? "";
    const value = raw === "" ? null : raw.replace(/^properties\//i, "").replace(/\D/g, "") || null;

    const { error } = await supabase.from("clients").update({ ga4_property_id: value }).eq("id", id);
    if (error) throw new Error(`${id}: ${error.message}`);
    updated += 1;
  }

  return { updated };
}

/** Server-only: load clients for initial paint (no Google call). */
export async function loadClientsForGa4MapperAction(): Promise<ClientMapperRow[]> {
  assertGa4MapperAllowed();

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("clients")
    .select("id, business_name, website, ga4_property_id")
    .order("business_name", { ascending: true });

  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => ({
    id: String((row as { id: string }).id),
    business_name: String((row as { business_name: string | null }).business_name ?? ""),
    website: (row as { website: string | null }).website ?? null,
    ga4_property_id: (row as { ga4_property_id: string | null }).ga4_property_id ?? null,
  }));
}
