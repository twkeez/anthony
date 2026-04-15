import { NextResponse, type NextRequest } from "next/server";

import { DASHBOARD_SESSION_COOKIE, dashboardAuthEnabled } from "@/lib/auth/dashboard-auth-config";
import { verifyDashboardSessionToken } from "@/lib/auth/verify-dashboard-session";

const PUBLIC_API_PREFIXES = [
  "/api/auth/login",
  "/api/auth/logout",
  "/api/integrations/google/callback",
];

function isPublicApi(pathname: string): boolean {
  return PUBLIC_API_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

function cronAuthorized(request: NextRequest): boolean {
  const secret = process.env.SYNC_CRON_SECRET?.trim();
  if (!secret) return false;
  const auth = request.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

export async function middleware(request: NextRequest) {
  if (!dashboardAuthEnabled()) {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/api/")) {
    if (isPublicApi(pathname)) {
      return NextResponse.next();
    }
    if (pathname === "/api/sync" && request.method === "POST" && cronAuthorized(request)) {
      return NextResponse.next();
    }
    const token = request.cookies.get(DASHBOARD_SESSION_COOKIE)?.value;
    const secret = process.env.DASHBOARD_SESSION_SECRET!.trim();
    if (!token || !(await verifyDashboardSessionToken(token, secret))) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    return NextResponse.next();
  }

  if (pathname === "/login") {
    return NextResponse.next();
  }

  const token = request.cookies.get(DASHBOARD_SESSION_COOKIE)?.value;
  const secret = process.env.DASHBOARD_SESSION_SECRET!.trim();
  if (token && (await verifyDashboardSessionToken(token, secret))) {
    return NextResponse.next();
  }

  const login = new URL("/login", request.url);
  login.searchParams.set("next", pathname + request.nextUrl.search);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/", "/dashboard/:path*", "/api/:path*"],
};
