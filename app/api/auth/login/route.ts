import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

import { dashboardAuthEnabled } from "@/lib/auth/dashboard-auth-config";
import { dashboardSessionCookieHeader, signDashboardSessionToken } from "@/lib/auth/dashboard-session-node";

function safeEqualPassword(given: string, expected: string): boolean {
  try {
    const a = Buffer.from(given, "utf8");
    const b = Buffer.from(expected, "utf8");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  if (!dashboardAuthEnabled()) {
    return NextResponse.json({ error: "dashboard_auth_not_configured" }, { status: 501 });
  }

  let body: { password?: string };
  try {
    body = (await request.json()) as { password?: string };
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const expected = process.env.DASHBOARD_PASSWORD!.trim();
  const secret = process.env.DASHBOARD_SESSION_SECRET!.trim();
  const given = String(body.password ?? "");

  if (!safeEqualPassword(given, expected)) {
    return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
  }

  const token = signDashboardSessionToken(secret);
  const res = NextResponse.json({ ok: true });
  res.headers.append("Set-Cookie", dashboardSessionCookieHeader(token));
  return res;
}
