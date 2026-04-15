import type { Metadata } from "next";

import { TeamManagementClient } from "@/components/agencypulse/team-management-client";
import { createSupabasePublicClient } from "@/lib/supabase/public";
import type { StaffRow } from "@/lib/staff/staff-types";

export const metadata: Metadata = {
  title: "anthony · Team",
  description: "Manage agency staff, Basecamp matching, and AI voice profiles.",
};

export default async function TeamSettingsPage() {
  const supabase = createSupabasePublicClient();
  const { data, error } = await supabase.from("staff").select("*").order("full_name", { ascending: true });

  if (error) {
    console.error("[team settings] staff load:", error.message);
  }

  return <TeamManagementClient initialStaff={(data ?? []) as StaffRow[]} />;
}
