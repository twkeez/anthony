import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let browserPublicClient: SupabaseClient | null = null;

function newPublicClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Anonymous reads (RLS must allow). Safe for server components that only SELECT.
 * Reuses one client in the browser so parallel fetches do not spawn multiple GoTrue clients.
 */
export function createSupabasePublicClient(): SupabaseClient {
  if (typeof window !== "undefined") {
    if (!browserPublicClient) {
      browserPublicClient = newPublicClient();
    }
    return browserPublicClient;
  }
  return newPublicClient();
}
