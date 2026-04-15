import { NextResponse } from "next/server";

import { DASHBOARD_SESSION_COOKIE } from "@/lib/auth/dashboard-auth-config";

/** Clears the dashboard session cookie. */
export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.headers.append(
    "Set-Cookie",
    `${DASHBOARD_SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
  );
  return res;
}
