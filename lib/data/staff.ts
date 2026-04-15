import { cache } from "react";

import { createSupabasePublicClient } from "@/lib/supabase/public";

export type StaffOptionRow = { id: string; full_name: string };

/** Active staff for client primary strategist dropdown (public read). */
export const fetchStaffForStrategistSelect = cache(async (): Promise<StaffOptionRow[]> => {
  const supabase = createSupabasePublicClient();
  const { data, error } = await supabase
    .from("staff")
    .select("id, full_name")
    .eq("is_active", true)
    .order("full_name", { ascending: true });

  if (error) {
    console.error("[fetchStaffForStrategistSelect]", error.message);
    return [];
  }
  return (data ?? []).map((r) => ({
    id: String((r as { id: string }).id),
    full_name: String((r as { full_name: string }).full_name ?? "").trim() || "Unnamed",
  }));
});
