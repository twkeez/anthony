import { parseGa4PropertyId } from "@/lib/google/ga4-property-id";

export type Ga4PropertyOption = {
  /** e.g. `properties/123456789` */
  resourceName: string;
  displayName: string;
  /** Digits from `properties/{id}` */
  numericId: string;
};

export type ClientMapperRow = {
  id: string;
  business_name: string;
  website: string | null;
  ga4_property_id: string | null;
};

function stripNoiseFromName(s: string): string {
  return s
    .replace(/\b(ga4|website|analytics|property|www)\b/gi, " ")
    .replace(/[^a-zA-Z0-9\s.-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeForCompare(s: string): string {
  return stripNoiseFromName(s).toLowerCase();
}

export function hostnameFromWebsite(url: string | null | undefined): string | null {
  if (url == null || url.trim() === "") return null;
  const raw = url.trim();
  try {
    const u = raw.includes("://") ? new URL(raw) : new URL(`https://${raw}`);
    return u.hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return null;
  }
}

/** GA4 IDs in DB may be numeric or `properties/…`. UA / G- IDs return "". */
export function normalizeGa4StoredId(raw: string | null | undefined): string {
  const p = parseGa4PropertyId(raw);
  return p.ok ? p.numericId : "";
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

function scoreClientToProperty(client: ClientMapperRow, prop: Ga4PropertyOption): number {
  let score = 0;
  const bn = normalizeForCompare(client.business_name);
  const pn = normalizeForCompare(prop.displayName);
  const host = hostnameFromWebsite(client.website);
  const pnRaw = prop.displayName.toLowerCase();

  if (bn && pn) {
    if (bn === pn) score += 120;
    else if (pn.includes(bn) || bn.includes(pn)) score += 90;
    else score += tokenOverlap(client.business_name, prop.displayName) * 18;
  }

  if (host) {
    if (pnRaw.includes(host)) score += 85;
    const apex = host.split(".")[0] ?? "";
    if (apex.length > 2 && (pnRaw.includes(apex) || bn.includes(apex))) score += 45;
  }

  return score;
}

const MIN_SCORE = 42;

/** Top candidates within this score band of the leader are treated as competing (ambiguous). */
const DISCOVERY_AMBIGUITY_DELTA = 12;

export type Ga4DiscoveryScored = { property: Ga4PropertyOption; score: number };

export type Ga4DiscoveryResolution =
  | { kind: "matched"; property: Ga4PropertyOption; score: number }
  | { kind: "ambiguous"; candidates: Ga4DiscoveryScored[] }
  | { kind: "none"; best: Ga4DiscoveryScored | null };

/**
 * Classifies a client against all GA4 properties: single high-confidence winner, several close
 * scores (ambiguous), or nothing above the confidence floor.
 */
export function resolveGa4DiscoveryForClient(
  client: ClientMapperRow,
  properties: Ga4PropertyOption[],
  options?: { minScore?: number; ambiguityDelta?: number },
): Ga4DiscoveryResolution {
  const minScore = options?.minScore ?? MIN_SCORE;
  const ambiguityDelta = options?.ambiguityDelta ?? DISCOVERY_AMBIGUITY_DELTA;

  if (properties.length === 0) {
    return { kind: "none", best: null };
  }

  const scored: Ga4DiscoveryScored[] = properties.map((p) => ({
    property: p,
    score: scoreClientToProperty(client, p),
  }));
  scored.sort((a, b) => b.score - a.score);

  const top = scored[0]!;
  if (top.score < minScore) {
    return { kind: "none", best: top };
  }

  const band = scored.filter((x) => x.score >= minScore && top.score - x.score <= ambiguityDelta);
  if (band.length > 1) {
    return { kind: "ambiguous", candidates: band };
  }
  return { kind: "matched", property: top.property, score: top.score };
}

/**
 * Picks the best GA4 property for a Supabase client using name + website heuristics.
 * (Prefers a single winner even when runners-up are close; use {@link resolveGa4DiscoveryForClient}
 * when ambiguous ties must be surfaced.)
 */
export function suggestGa4Match(
  client: ClientMapperRow,
  properties: Ga4PropertyOption[],
): Ga4PropertyOption | null {
  let best: Ga4PropertyOption | null = null;
  let bestScore = 0;
  for (const p of properties) {
    const s = scoreClientToProperty(client, p);
    if (s > bestScore) {
      bestScore = s;
      best = p;
    }
  }
  return best != null && bestScore >= MIN_SCORE ? best : null;
}
