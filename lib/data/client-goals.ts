import { createSupabasePublicClient } from "@/lib/supabase/public";
import type { ClientGoalRow } from "@/types/database.types";

function mapGoal(raw: Record<string, unknown>): ClientGoalRow {
  const kw = raw.evidence_keywords;
  const evidence_keywords = Array.isArray(kw)
    ? kw.map((x) => String(x).trim()).filter((s) => s.length > 0)
    : [];
  return {
    id: String(raw.id),
    client_id: String(raw.client_id),
    goal_type: raw.goal_type as ClientGoalRow["goal_type"],
    target_value: Number(raw.target_value),
    metric_target_column: String(raw.metric_target_column ?? ""),
    intent_statement: String(raw.intent_statement ?? ""),
    evidence_keywords,
    status: raw.status as ClientGoalRow["status"],
    ai_analysis: raw.ai_analysis != null ? String(raw.ai_analysis) : null,
    created_at: String(raw.created_at),
    updated_at: String(raw.updated_at),
  };
}

export async function fetchClientGoals(clientId: string): Promise<ClientGoalRow[]> {
  const supabase = createSupabasePublicClient();
  const { data, error } = await supabase
    .from("client_goals")
    .select("*")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false });

  if (error) {
    const msg = (error.message ?? "").trim();
    const code = (error as { code?: string }).code;
    // PostgREST when the table is not in the schema cache yet, or Postgres when the relation was never migrated.
    const looksMissing =
      code === "PGRST205" ||
      /could not find the table.*client_goals/i.test(msg) ||
      /relation ["']?public\.client_goals["']? does not exist/i.test(msg);
    if (looksMissing) {
      console.warn("[fetchClientGoals] client_goals not available yet; returning []. Run Supabase migrations.", msg);
      return [];
    }
    const details = typeof (error as { details?: unknown }).details === "string" ? (error as { details: string }).details.trim() : "";
    const hint = typeof error.hint === "string" ? error.hint.trim() : "";
    const parts = [msg, details, hint].filter((s) => s.length > 0);
    throw new Error(`client_goals: ${parts.join(" — ") || "Unknown Supabase error"}`);
  }
  const rows = (data ?? []).map((row) => mapGoal(row as Record<string, unknown>));
  rows.sort((a, b) => {
    if (a.status !== b.status) return a.status === "active" ? -1 : 1;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
  return rows;
}
