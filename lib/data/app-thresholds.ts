import { createSupabasePublicClient } from "@/lib/supabase/public";

/** Reads `app_thresholds.rules.min_performance_score` (default 50). Used by Lighthouse hub + KPIs. */
export async function fetchGlobalMinPerformanceScore(opts?: { signal?: AbortSignal }): Promise<number> {
  if (opts?.signal?.aborted) {
    throw opts.signal.reason ?? new DOMException("Aborted", "AbortError");
  }
  const supabase = createSupabasePublicClient();
  const { data, error } = await supabase.from("app_thresholds").select("rules").eq("id", "global").maybeSingle();

  if (error) throw new Error(error.message);
  const r = data?.rules as { min_performance_score?: unknown } | undefined;
  const n = typeof r?.min_performance_score === "number" ? r.min_performance_score : 50;
  return Math.max(0, Math.min(100, Math.round(n)));
}
