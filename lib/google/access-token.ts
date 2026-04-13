import { OAuth2Client } from "google-auth-library";

import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function getGoogleAccessTokenFromRefresh(): Promise<string> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are not configured.");
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("google_agency_connection")
    .select("refresh_token")
    .eq("id", 1)
    .maybeSingle();

  if (error) throw error;
  if (!data?.refresh_token) {
    throw new Error("Google is not connected yet. Use Connect Google (MCC) on the dashboard.");
  }

  const oauth2 = new OAuth2Client(clientId, clientSecret);
  oauth2.setCredentials({ refresh_token: data.refresh_token });
  const { credentials } = await oauth2.refreshAccessToken();
  if (!credentials.access_token) {
    throw new Error("Google did not return an access token.");
  }
  return credentials.access_token;
}
