import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

import { buildGoogleAuthorizeUrl } from "@/lib/google-oauth";

const STATE_COOKIE = "agencypulse_google_oauth_state";

export async function GET(request: NextRequest) {
  const origin = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? request.nextUrl.origin;
  try {
    const state = crypto.randomUUID();
    const jar = await cookies();
    jar.set(STATE_COOKIE, state, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 600,
    });
    const url = buildGoogleAuthorizeUrl(state);
    return NextResponse.redirect(url);
  } catch (e) {
    const message = e instanceof Error ? e.message : "OAuth start failed";
    const u = new URL("/dashboard", origin);
    u.searchParams.set("google_error", message);
    return NextResponse.redirect(u);
  }
}
