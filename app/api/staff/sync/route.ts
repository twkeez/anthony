import { NextResponse } from "next/server";

import { syncStaffFromBasecamp } from "@/lib/sync/staff-sync";

export async function POST() {
  const result = await syncStaffFromBasecamp();
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }
  return NextResponse.json({
    ok: true,
    upserted: result.upserted,
    skippedNoEmail: result.skippedNoEmail,
    skippedFilter: result.skippedFilter,
    setInactive: result.setInactive,
    setActive: result.setActive,
  });
}
