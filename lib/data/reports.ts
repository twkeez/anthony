import { createSupabasePublicClient } from "@/lib/supabase/public";
import type { ReportBlock, ReportRow } from "@/types/database.types";

export function parseReportBlocksFromJson(raw: unknown): ReportBlock[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((b) => {
      if (!b || typeof b !== "object") return null;
      const o = b as Record<string, unknown>;
      const id = typeof o.id === "string" ? o.id : "";
      const type = typeof o.type === "string" ? o.type : "";
      const title = typeof o.title === "string" ? o.title : "";
      const content = typeof o.content === "string" ? o.content : "";
      if (!id || !type || !title) return null;
      return { id, type, title, content } as ReportBlock;
    })
    .filter((x): x is ReportBlock => x != null);
}

function mapReport(raw: Record<string, unknown>): ReportRow {
  return {
    id: String(raw.id),
    client_id: String(raw.client_id),
    period_start: String(raw.period_start),
    period_end: String(raw.period_end),
    blocks: parseReportBlocksFromJson(raw.blocks),
    strategist_notes: raw.strategist_notes != null ? String(raw.strategist_notes) : null,
    public_id: String(raw.public_id),
    status: (raw.status as ReportRow["status"]) ?? "draft",
    created_at: String(raw.created_at),
    updated_at: String(raw.updated_at),
  };
}

export async function fetchPublishedReportByPublicId(publicId: string): Promise<ReportRow | null> {
  const supabase = createSupabasePublicClient();
  const { data, error } = await supabase
    .from("reports")
    .select("*")
    .eq("public_id", publicId)
    .eq("status", "published")
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return mapReport(data as Record<string, unknown>);
}
