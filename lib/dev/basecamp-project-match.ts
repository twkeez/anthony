import { hostnameFromWebsite } from "@/lib/dev/ga4-property-match";

export type BasecampProjectOption = {
  id: string;
  name: string;
};

export type ClientBasecampMapperRow = {
  id: string;
  business_name: string;
  website: string | null;
  basecamp_project_id: string | null;
};

function stripNoiseFromName(s: string): string {
  return s
    .replace(/\b(inc|llc|ltd|corp|co\.?|company|agency|client|project)\b/gi, " ")
    .replace(/[^a-zA-Z0-9\s.-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeForCompare(s: string): string {
  return stripNoiseFromName(s).toLowerCase();
}

function tokenOverlap(a: string, b: string): number {
  const ta = new Set(
    normalizeForCompare(a)
      .split(/\s+/)
      .filter((x) => x.length > 1),
  );
  const tb = new Set(
    normalizeForCompare(b)
      .split(/\s+/)
      .filter((x) => x.length > 1),
  );
  let n = 0;
  for (const t of ta) {
    if (tb.has(t)) n += 1;
  }
  return n;
}

function scoreClientToProject(client: ClientBasecampMapperRow, project: BasecampProjectOption): number {
  let score = 0;
  const bn = normalizeForCompare(client.business_name);
  const pn = normalizeForCompare(project.name);
  const host = hostnameFromWebsite(client.website);
  const pnRaw = project.name.toLowerCase();

  if (bn && pn) {
    if (bn === pn) score += 120;
    else if (pn.includes(bn) || bn.includes(pn)) score += 90;
    else score += tokenOverlap(client.business_name, project.name) * 18;
  }

  if (host) {
    if (pnRaw.includes(host)) score += 85;
    const apex = host.split(".")[0] ?? "";
    if (apex.length > 2 && (pnRaw.includes(apex) || bn.includes(apex))) score += 45;
  }

  return score;
}

const MIN_SCORE = 42;

/** Picks the best Basecamp project for a client using name + website heuristics. */
export function suggestBasecampMatch(
  client: ClientBasecampMapperRow,
  projects: BasecampProjectOption[],
): BasecampProjectOption | null {
  let best: BasecampProjectOption | null = null;
  let bestScore = 0;
  for (const p of projects) {
    const s = scoreClientToProject(client, p);
    if (s > bestScore) {
      bestScore = s;
      best = p;
    }
  }
  if (!best || bestScore < MIN_SCORE) return null;
  return best;
}
