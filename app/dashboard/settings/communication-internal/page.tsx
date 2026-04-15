import type { Metadata } from "next";

import { CommunicationInternalPartiesClient } from "@/components/agencypulse/communication-internal-parties-client";
import { createSupabasePublicClient } from "@/lib/supabase/public";
import type { CommunicationInternalPartyRow } from "@/lib/communication/internal-parties-types";

export const metadata: Metadata = {
  title: "anthony · Internal contacts",
  description: "Mark contractors and partners as internal for Basecamp communication classification.",
};

export default async function CommunicationInternalPartiesPage() {
  const supabase = createSupabasePublicClient();
  const { data, error } = await supabase
    .from("communication_internal_parties")
    .select("*")
    .order("is_active", { ascending: false })
    .order("display_name", { ascending: true, nullsFirst: false })
    .order("email", { ascending: true, nullsFirst: false });

  if (error) {
    console.error("[internal parties settings] load:", error.message);
  }

  return (
    <CommunicationInternalPartiesClient initialParties={(data ?? []) as CommunicationInternalPartyRow[]} />
  );
}
