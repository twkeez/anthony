import type { CommunicationInternalPartyForClassification } from "@/lib/communication/internal-parties-types";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * Active manual “internal” roster for Basecamp author matching during communication sync.
 * On error or missing table, returns [].
 */
export async function loadCommunicationInternalPartiesForClassification(): Promise<
  CommunicationInternalPartyForClassification[]
> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("communication_internal_parties")
      .select("email, basecamp_id, display_name, is_active")
      .eq("is_active", true);

    if (error) {
      console.warn("[communication sync] communication_internal_parties:", error.message);
      return [];
    }

    return (data ?? []).map((row) => ({
      email:
        (row as { email: string | null }).email != null && String((row as { email: string | null }).email).trim() !== ""
          ? String((row as { email: string | null }).email).trim().toLowerCase()
          : null,
      basecamp_id:
        (row as { basecamp_id: string | null }).basecamp_id != null &&
        String((row as { basecamp_id: string | null }).basecamp_id).trim() !== ""
          ? String((row as { basecamp_id: string | null }).basecamp_id).trim()
          : null,
      display_name:
        (row as { display_name: string | null }).display_name != null &&
        String((row as { display_name: string | null }).display_name).trim() !== ""
          ? String((row as { display_name: string | null }).display_name).trim()
          : null,
      is_active: Boolean((row as { is_active?: boolean }).is_active),
    }));
  } catch (e) {
    console.warn(
      "[communication sync] communication_internal_parties:",
      e instanceof Error ? e.message : e,
    );
    return [];
  }
}
