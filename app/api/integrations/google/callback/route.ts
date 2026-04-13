import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

import { exchangeCodeForTokens } from "@/lib/google-oauth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const STATE_COOKIE = "agencypulse_google_oauth_state";

function baseUrl(request: NextRequest) {
  return process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? request.nextUrl.origin;
}

export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  const redirectHome = (params: Record<string, string>) => {
    const u = new URL("/", baseUrl(request));
    Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, v));
    return NextResponse.redirect(u);
  };

  if (oauthError) {
    return redirectHome({ google_error: oauthError });
  }

  if (!code || !state) {
    return redirectHome({ google_error: "missing_code_or_state" });
  }

  const jar = await cookies();
  const expected = jar.get(STATE_COOKIE)?.value;
  jar.delete(STATE_COOKIE);

  if (!expected || expected !== state) {
    return redirectHome({ google_error: "invalid_state" });
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    const expiresAt = new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString();

    let connectedEmail: string | null = null;
    try {
      const ui = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      if (ui.ok) {
        const profile = (await ui.json()) as { email?: string };
        connectedEmail = profile.email ?? null;
      }
    } catch {
      /* optional profile */
    }

    const supabase = getSupabaseAdmin();

    // Google may omit `refresh_token` on repeat consent; do not overwrite a valid one with null.
    let refreshToken = tokens.refresh_token ?? null;
    if (!refreshToken) {
      const { data: existing } = await supabase
        .from("google_agency_connection")
        .select("refresh_token")
        .eq("id", 1)
        .maybeSingle();
      refreshToken = existing?.refresh_token ?? null;
    }

    const { error } = await supabase.from("google_agency_connection").upsert(
      {
        id: 1,
        access_token: tokens.access_token,
        refresh_token: refreshToken,
        token_expires_at: expiresAt,
        scopes: tokens.scope ?? null,
        connected_email: connectedEmail,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );

    if (error) throw error;

    return redirectHome({ google_connected: "1" });
  } catch (e) {
    const message = e instanceof Error ? e.message : "callback_failed";
    return redirectHome({ google_error: message });
  }
}
