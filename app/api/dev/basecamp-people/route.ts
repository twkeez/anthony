import { NextResponse } from "next/server";

import { fetchBasecampPeople } from "@/lib/basecamp/basecamp-api";
import type { BasecampPeopleDirectoryRow } from "@/lib/basecamp/people-directory-types";
import { isBasecampPeopleDirectoryEnabled } from "@/lib/dev/basecamp-mapper-guard";

/**
 * GET — all people in the configured Basecamp account (`/api/v1/people.json`).
 * Disabled in production unless `ENABLE_BASECAMP_MAPPER=1` or `ENABLE_BASECAMP_DIRECTORY=1`.
 */
export async function GET() {
  if (!isBasecampPeopleDirectoryEnabled()) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  try {
    const raw = await fetchBasecampPeople();
    const people: BasecampPeopleDirectoryRow[] = raw.map((p) => ({
      id: p.id,
      name: p.name,
      email: p.email_address.trim() !== "" ? p.email_address.trim().toLowerCase() : null,
    }));
    people.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
    return NextResponse.json({ people, count: people.length });
  } catch (e) {
    const message = e instanceof Error ? e.message : "basecamp_people_failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
