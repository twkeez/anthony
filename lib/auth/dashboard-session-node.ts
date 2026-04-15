import { createHmac } from "node:crypto";

import { DASHBOARD_SESSION_COOKIE } from "@/lib/auth/dashboard-auth-config";

/** HMAC-SHA256 over the base64url payload segment (Edge verifier must use the same message bytes). */
export function signDashboardSessionToken(secret: string, ttlSeconds = 60 * 60 * 24 * 7): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload = Buffer.from(JSON.stringify({ v: 1 as const, exp }), "utf8").toString("base64url");
  const sig = createHmac("sha256", secret).update(payload, "utf8").digest("base64url");
  return `${payload}.${sig}`;
}

export function dashboardSessionCookieHeader(token: string): string {
  const maxAge = 60 * 60 * 24 * 7;
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${DASHBOARD_SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}
