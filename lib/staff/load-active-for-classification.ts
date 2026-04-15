import type { StaffMemberForClassification } from "@/lib/staff/staff-types";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * Loads active `staff` rows for Basecamp author matching during communication sync.
 * On error or missing table, returns [] so callers fall back to env lists + `isBeyondInternalEmail`.
 */
export async function loadActiveStaffForClassification(): Promise<StaffMemberForClassification[]> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("staff")
      .select("email, basecamp_id, basecamp_name_handle, full_name, is_active")
      .eq("is_active", true);

    if (error) {
      console.warn("[communication sync] staff:", error.message);
      return [];
    }

    return (data ?? []).map((row) => ({
      email: String((row as { email: string }).email ?? "").trim(),
      basecamp_id:
        (row as { basecamp_id: string | null }).basecamp_id != null
          ? String((row as { basecamp_id: string | null }).basecamp_id).trim() || null
          : null,
      basecamp_name_handle:
        (row as { basecamp_name_handle: string | null }).basecamp_name_handle != null
          ? String((row as { basecamp_name_handle: string | null }).basecamp_name_handle).trim() || null
          : null,
      full_name: String((row as { full_name: string }).full_name ?? "").trim() || "Unknown",
      is_active: Boolean((row as { is_active?: boolean }).is_active),
    }));
  } catch (e) {
    console.warn("[communication sync] staff:", e instanceof Error ? e.message : e);
    return [];
  }
}
