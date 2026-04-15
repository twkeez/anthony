export type StrategyRoadmapItem = {
  id: string;
  title: string;
  due_date: string | null;
};

export type StrategyWorkspace = {
  recommendation?: string;
  roadmap_items?: StrategyRoadmapItem[];
};

const MAX_RECOMMENDATION_LEN = 100_000;
const MAX_ROADMAP = 80;
const MAX_TITLE_LEN = 500;

function newRoadmapItemId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `rm_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

export function parseStrategyWorkspace(raw: unknown): StrategyWorkspace {
  if (!raw || typeof raw !== "object") return {};
  const o = raw as Record<string, unknown>;
  const out: StrategyWorkspace = {};
  if (typeof o.recommendation === "string") {
    out.recommendation = o.recommendation.slice(0, MAX_RECOMMENDATION_LEN);
  }
  if (Array.isArray(o.roadmap_items)) {
    const items: StrategyRoadmapItem[] = [];
    for (const row of o.roadmap_items.slice(0, MAX_ROADMAP)) {
      if (!row || typeof row !== "object") continue;
      const r = row as Record<string, unknown>;
      const id = typeof r.id === "string" && r.id.trim() !== "" ? r.id.trim() : newRoadmapItemId();
      const title = typeof r.title === "string" ? r.title.trim().slice(0, MAX_TITLE_LEN) : "";
      if (!title) continue;
      const due =
        r.due_date === null || r.due_date === undefined
          ? null
          : typeof r.due_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.due_date.trim())
            ? r.due_date.trim()
            : null;
      items.push({ id, title, due_date: due });
    }
    if (items.length > 0) out.roadmap_items = items;
  }
  return out;
}
