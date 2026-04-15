import { fetchBasecampPeople } from "@/lib/basecamp/basecamp-api";
import type { BasecampPerson } from "@/lib/basecamp/basecamp-api";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  loadStaffActivityFromClientProjects,
  mergeStaffActivityFromClientMetrics,
  mergeStaffActivityFromPeopleDirectory,
  type StaffActivityKeys,
} from "@/lib/sync/staff-recent-activity";

/** Max length for `staff.basecamp_name_handle` when mirroring Basecamp display names. */
const BASECAMP_NAME_HANDLE_MAX = 500;

function parseGmailWhitelist(): Set<string> {
  const raw = process.env.STAFF_SYNC_GMAIL_WHITELIST?.trim() ?? "";
  const s = new Set<string>();
  for (const part of raw.split(",")) {
    const e = part.trim().toLowerCase();
    if (e) s.add(e);
  }
  return s;
}

/**
 * Strict roster rules for Basecamp → staff sync:
 * - `@beyondindigo.com` (and its subdomains), or
 * - `@gmail.com` / `@googlemail.com` only if the full address is listed in `STAFF_SYNC_GMAIL_WHITELIST`.
 *
 * All other domains (including generic Gmail not on the list) are skipped.
 */
export function isStaffSyncEligibleEmail(email: string | null | undefined): boolean {
  if (email == null || typeof email !== "string") return false;
  const e = email.trim().toLowerCase();
  const at = e.lastIndexOf("@");
  if (at < 0) return false;
  const domain = e.slice(at + 1);
  if (domain === "beyondindigo.com" || domain.endsWith(".beyondindigo.com")) return true;
  if (domain === "gmail.com" || domain === "googlemail.com") {
    return parseGmailWhitelist().has(e);
  }
  return false;
}

function normalizeStaffEmail(email: string): string {
  return email.trim().toLowerCase();
}

function truncateHandle(name: string): string {
  const t = name.trim();
  if (t.length <= BASECAMP_NAME_HANDLE_MAX) return t;
  return `${t.slice(0, BASECAMP_NAME_HANDLE_MAX - 1)}…`;
}

function matchesRecentKeys(
  keys: StaffActivityKeys,
  email: string,
  basecampId: string | null | undefined,
  displayName: string,
): boolean {
  const em = normalizeStaffEmail(email);
  if (em && keys.emails.has(em)) return true;
  const id = String(basecampId ?? "").trim();
  if (id && keys.ids.has(id)) return true;
  const n = displayName.trim().toLowerCase();
  if (n && keys.namesLower.has(n)) return true;
  return false;
}

function personIsRecentlyActive(p: BasecampPerson, keys: StaffActivityKeys): boolean {
  return matchesRecentKeys(keys, p.email_address || "", p.id, p.name || "");
}

async function buildRecentActivityKeys(people: readonly BasecampPerson[]): Promise<StaffActivityKeys> {
  const fromTopics = await loadStaffActivityFromClientProjects();
  await mergeStaffActivityFromClientMetrics(fromTopics);
  mergeStaffActivityFromPeopleDirectory(people, fromTopics);
  return fromTopics;
}

function chunkIds(ids: string[], size: number): string[][] {
  const out: string[][] = [];
  for (let i = 0; i < ids.length; i += size) {
    out.push(ids.slice(i, i + size));
  }
  return out;
}

/**
 * Sets `is_active` for every staff row that falls under {@link isStaffSyncEligibleEmail} so it matches
 * the 90-day / metrics activity keys (soft-offboard; preserves `writing_style_notes`).
 */
async function reconcileEligibleStaffActivity(
  keys: StaffActivityKeys,
  now: string,
): Promise<{ setInactive: number; setActive: number }> {
  const supabase = getSupabaseAdmin();
  const { data: rows, error } = await supabase
    .from("staff")
    .select("id, email, basecamp_id, basecamp_name_handle, full_name, is_active");

  if (error) {
    throw new Error(error.message);
  }

  const falseIds: string[] = [];
  const trueIds: string[] = [];

  for (const row of rows ?? []) {
    const r = row as {
      id: string;
      email: string;
      basecamp_id: string | null;
      basecamp_name_handle: string | null;
      full_name: string;
      is_active: boolean;
    };
    if (!isStaffSyncEligibleEmail(r.email)) continue;
    const display = (r.basecamp_name_handle ?? r.full_name ?? "").trim();
    const wantActive = matchesRecentKeys(keys, r.email, r.basecamp_id, display);
    if (wantActive === r.is_active) continue;
    if (wantActive) trueIds.push(r.id);
    else falseIds.push(r.id);
  }

  let setInactive = 0;
  let setActive = 0;
  const batch = 100;

  for (const chunk of chunkIds(falseIds, batch)) {
    if (chunk.length === 0) continue;
    const { error: uErr } = await supabase
      .from("staff")
      .update({ is_active: false, updated_at: now })
      .in("id", chunk);
    if (uErr) throw new Error(uErr.message);
    setInactive += chunk.length;
  }
  for (const chunk of chunkIds(trueIds, batch)) {
    if (chunk.length === 0) continue;
    const { error: uErr } = await supabase
      .from("staff")
      .update({ is_active: true, updated_at: now })
      .in("id", chunk);
    if (uErr) throw new Error(uErr.message);
    setActive += chunk.length;
  }

  return { setInactive, setActive };
}

export type StaffSyncFromBasecampResult =
  | {
      ok: true;
      upserted: number;
      skippedNoEmail: number;
      skippedFilter: number;
      setInactive: number;
      setActive: number;
    }
  | { ok: false; error: string };

/**
 * Fetches Basecamp people, applies strict email rules, upserts into `public.staff` on `email`,
 * sets `is_active` from rolling message-board window / `communication_alerts` / optional directory `updated_at`
 * activity, then reconciles all eligible existing rows. Preserves `writing_style_notes` on upsert.
 */
export async function syncStaffFromBasecamp(): Promise<StaffSyncFromBasecampResult> {
  let people: BasecampPerson[];
  try {
    people = await fetchBasecampPeople();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }

  const keys = await buildRecentActivityKeys(people);
  const supabase = getSupabaseAdmin();

  const { data: existingRows, error: exErr } = await supabase
    .from("staff")
    .select("email, writing_style_notes");

  if (exErr) {
    return { ok: false, error: exErr.message };
  }

  const notesByEmail = new Map<string, string | null>();
  for (const row of existingRows ?? []) {
    const r = row as { email: string; writing_style_notes: string | null };
    const key = normalizeStaffEmail(String(r.email ?? ""));
    if (key) notesByEmail.set(key, r.writing_style_notes);
  }

  let skippedNoEmail = 0;
  let skippedFilter = 0;
  const payloads: Record<string, unknown>[] = [];
  const seenEmails = new Set<string>();

  const now = new Date().toISOString();

  for (const p of people) {
    const rawEmail = (p.email_address ?? "").trim();
    if (!rawEmail) {
      skippedNoEmail += 1;
      continue;
    }
    if (!isStaffSyncEligibleEmail(rawEmail)) {
      skippedFilter += 1;
      continue;
    }
    const email = normalizeStaffEmail(rawEmail);
    if (seenEmails.has(email)) continue;
    seenEmails.add(email);

    const name = (p.name ?? "").trim() || email.split("@")[0] || "Team member";
    const isActive = personIsRecentlyActive(p, keys);
    payloads.push({
      full_name: name,
      email,
      basecamp_id: p.id,
      basecamp_name_handle: truncateHandle(name),
      is_active: isActive,
      writing_style_notes: notesByEmail.has(email) ? notesByEmail.get(email) ?? null : null,
      updated_at: now,
    });
  }

  let upserted = 0;
  const chunkSize = 80;
  for (let i = 0; i < payloads.length; i += chunkSize) {
    const chunk = payloads.slice(i, i + chunkSize);
    if (chunk.length === 0) continue;
    const { error: upErr } = await supabase.from("staff").upsert(chunk, { onConflict: "email" });
    if (upErr) {
      return { ok: false, error: upErr.message };
    }
    upserted += chunk.length;
  }

  let setInactive = 0;
  let setActive = 0;
  try {
    const r = await reconcileEligibleStaffActivity(keys, now);
    setInactive = r.setInactive;
    setActive = r.setActive;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }

  return {
    ok: true,
    upserted,
    skippedNoEmail,
    skippedFilter,
    setInactive,
    setActive,
  };
}
