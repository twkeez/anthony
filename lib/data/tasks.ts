import { createSupabasePublicClient } from "@/lib/supabase/public";
import type { TaskRow, TaskWithClient } from "@/types/database.types";

export async function fetchTasksForClient(clientId: string): Promise<TaskRow[]> {
  const supabase = createSupabasePublicClient();
  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .eq("client_id", clientId)
    .order("due_date", { ascending: true, nullsFirst: false });

  if (error) throw error;
  return (data ?? []) as TaskRow[];
}

export type TaskSortKey = "due_date" | "assigned_to";

export async function fetchAllTasksSorted(
  sort: TaskSortKey,
  order: "asc" | "desc",
): Promise<TaskWithClient[]> {
  const supabase = createSupabasePublicClient();
  const ascending = order === "asc";
  const { data, error } = await supabase
    .from("tasks")
    .select("*, clients ( id, business_name )")
    .order(sort, { ascending, nullsFirst: false });

  if (error) throw error;
  return (data ?? []) as TaskWithClient[];
}
