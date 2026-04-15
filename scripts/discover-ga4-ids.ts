/**
 * Discovers GA4 numeric property IDs for Supabase clients using the Google Analytics Admin API
 * (v1beta `accountSummaries.list`) and name/website heuristics from `lib/dev/ga4-property-match.ts`.
 *
 * OAuth scopes for Admin + Data APIs live in `lib/google-oauth.ts` (`GOOGLE_OAUTH_SCOPES`).
 * This script refreshes an access token from `google_agency_connection` via
 * `getGoogleAccessTokenFromRefresh` (same as dashboard sync).
 *
 * Usage (from repo root):
 *   npx tsx scripts/discover-ga4-ids.ts           # apply updates for high-confidence matches
 *   npx tsx scripts/discover-ga4-ids.ts --dry-run # log only, no Supabase writes
 *
 * Requires `.env.local` with Google + Supabase service role (see `getSupabaseAdmin`).
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

import { config } from "dotenv";

import {
  type ClientMapperRow,
  normalizeGa4StoredId,
  resolveGa4DiscoveryForClient,
  type Ga4DiscoveryResolution,
} from "@/lib/dev/ga4-property-match";
import { getGoogleAccessTokenFromRefresh } from "@/lib/google/access-token";
import { listAllGa4PropertiesForAgency } from "@/lib/google/ga4-admin-properties";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

config({ path: path.join(root, ".env.local") });

const dryRun = process.argv.includes("--dry-run");

type MatchedRow = { id: string; business_name: string; propertyId: string; displayName: string; score: number };
type AmbiguousRow = {
  id: string;
  business_name: string;
  candidates: { displayName: string; numericId: string; score: number }[];
};
type NoneRow = { id: string; business_name: string; note: string };

function formatResolution(resolution: Ga4DiscoveryResolution): string {
  if (resolution.kind === "none") {
    const b = resolution.best;
    return b ? `best "${b.property.displayName}" (score ${b.score})` : "no properties to score";
  }
  if (resolution.kind === "ambiguous") {
    return resolution.candidates
      .map((c) => `"${c.property.displayName}" (${c.property.numericId}, ${c.score})`)
      .join(" | ");
  }
  return `"${resolution.property.displayName}" (${resolution.property.numericId}, ${resolution.score})`;
}

async function main() {
  const accessToken = await getGoogleAccessTokenFromRefresh();
  const { properties, accountSummariesCount } = await listAllGa4PropertiesForAgency(accessToken);

  console.log(
    `[discover-ga4-ids] Admin API: ${accountSummariesCount} account summary row(s), ${properties.length} unique GA4 properties.`,
  );

  const supabase = getSupabaseAdmin();
  const { data: clientRows, error } = await supabase
    .from("clients")
    .select("id, business_name, website, ga4_property_id")
    .order("business_name", { ascending: true });

  if (error) {
    console.error("[discover-ga4-ids] Supabase error:", error.message);
    process.exit(1);
  }

  const matched: MatchedRow[] = [];
  const ambiguous: AmbiguousRow[] = [];
  const none: NoneRow[] = [];

  for (const row of clientRows ?? []) {
    const client: ClientMapperRow = {
      id: String((row as { id: string }).id),
      business_name: String((row as { business_name: string | null }).business_name ?? ""),
      website: (row as { website: string | null }).website ?? null,
      ga4_property_id: (row as { ga4_property_id: string | null }).ga4_property_id ?? null,
    };

    const resolution = resolveGa4DiscoveryForClient(client, properties);

    if (resolution.kind === "ambiguous") {
      ambiguous.push({
        id: client.id,
        business_name: client.business_name,
        candidates: resolution.candidates.map((c) => ({
          displayName: c.property.displayName,
          numericId: c.property.numericId,
          score: c.score,
        })),
      });
      continue;
    }

    if (resolution.kind === "none") {
      none.push({
        id: client.id,
        business_name: client.business_name,
        note: formatResolution(resolution),
      });
      continue;
    }

    const nextId = resolution.property.numericId;
    const currentNorm = normalizeGa4StoredId(client.ga4_property_id);
    if (currentNorm === nextId) {
      none.push({
        id: client.id,
        business_name: client.business_name,
        note: `already set to ${nextId} (skipped)`,
      });
      continue;
    }

    if (!dryRun) {
      const { error: upErr } = await supabase.from("clients").update({ ga4_property_id: nextId }).eq("id", client.id);
      if (upErr) {
        console.error(`[discover-ga4-ids] Update failed for ${client.id}:`, upErr.message);
        process.exit(1);
      }
    }

    matched.push({
      id: client.id,
      business_name: client.business_name,
      propertyId: nextId,
      displayName: resolution.property.displayName,
      score: resolution.score,
    });
  }

  console.log("");
  console.log(dryRun ? "=== DRY RUN (no writes) ===" : "=== Applied updates ===");
  console.log("");
  console.log(`Successfully matched (${dryRun ? "would update" : "updated"}): ${matched.length}`);
  for (const m of matched) {
    console.log(
      `  • ${m.business_name} → ${m.propertyId} (${m.displayName}, score ${m.score})${dryRun ? " [dry-run]" : ""}`,
    );
  }

  console.log("");
  console.log(`Ambiguous (multiple plausible properties, no write): ${ambiguous.length}`);
  for (const a of ambiguous) {
    console.log(`  • ${a.business_name}`);
    for (const c of a.candidates) {
      console.log(`      - ${c.displayName} (${c.numericId}) score ${c.score}`);
    }
  }

  console.log("");
  console.log(`No match / skipped: ${none.length}`);
  for (const n of none) {
    console.log(`  • ${n.business_name}: ${n.note}`);
  }

  console.log("");
  console.log("[discover-ga4-ids] Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
