import { NextResponse } from "next/server";

import { getGoogleAccessTokenFromRefresh } from "@/lib/google/access-token";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { syncCommunicationAlertsFromBasecamp } from "@/lib/sync/communication-sync";
import { syncClientMetrics, type MetricsSyncScope } from "@/lib/sync/client-metrics-sync";

type Failure = { id: string; name: string; error: string };

const VALID_METRICS_SCOPES = new Set<string>(["ads", "ga4", "gsc", "lighthouse"]);

type ParsedBody =
  | { kind: "full" }
  | { kind: "communication" }
  | { kind: "metrics"; scope: MetricsSyncScope }
  | { kind: "invalid"; message: string };

function parseBody(scopeRaw: unknown): ParsedBody {
  if (scopeRaw === undefined || scopeRaw === null || scopeRaw === "") {
    return { kind: "full" };
  }
  if (typeof scopeRaw !== "string") {
    return { kind: "invalid", message: "scope must be a string." };
  }
  const s = scopeRaw.trim();
  if (s === "") return { kind: "full" };
  if (s === "communication") return { kind: "communication" };
  if (VALID_METRICS_SCOPES.has(s)) return { kind: "metrics", scope: s as MetricsSyncScope };
  return {
    kind: "invalid",
    message: `Invalid scope "${s}". Use ads, ga4, gsc, lighthouse, communication, or omit for full sync.`,
  };
}

/**
 * Batch metrics sync. Optional JSON body: `{ "scope": "ga4" | "ads" | "gsc" | "lighthouse" | "communication" }`.
 * Omit scope or POST with empty body for full sync (all Google slices per client + Basecamp at the end).
 * `communication` runs only Basecamp (no Google APIs).
 */
export async function POST(request: Request) {
  let body: { scope?: unknown } = {};
  try {
    const text = await request.text();
    if (text.trim()) {
      body = JSON.parse(text) as { scope?: unknown };
    }
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = parseBody(body.scope);
  if (parsed.kind === "invalid") {
    return NextResponse.json({ ok: false, message: parsed.message }, { status: 400 });
  }

  if (parsed.kind === "communication") {
    try {
      const comm = await syncCommunicationAlertsFromBasecamp();
      const note = comm.error
        ? `Basecamp communication sync skipped: ${comm.error}`
        : `Communication insights & action items (Basecamp) refreshed for ${comm.clientsUpdated} client metrics row(s).`;
      return NextResponse.json({
        ok: !comm.error,
        message: note,
        total: 0,
        succeeded: 0,
        failed: 0,
        failures: [] as Failure[],
        scope: "communication",
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn("[sync] communication-only:", e);
      return NextResponse.json({
        ok: false,
        message: `Communication sync error: ${msg}`,
        total: 0,
        succeeded: 0,
        failed: 0,
        failures: [] as Failure[],
        scope: "communication",
      });
    }
  }

  const metricsScope: MetricsSyncScope | undefined =
    parsed.kind === "metrics" ? parsed.scope : undefined;
  const scopeLabel = parsed.kind === "metrics" ? parsed.scope : "full";

  const supabase = getSupabaseAdmin();

  const { data: rows, error: listErr } = await supabase
    .from("clients")
    .select("id, business_name")
    .order("business_name", { ascending: true });

  if (listErr) {
    console.error("[sync all] list clients:", listErr);
    return NextResponse.json(
      { ok: false, message: listErr.message, total: 0, succeeded: 0, failed: 0, failures: [] as Failure[] },
      { status: 500 },
    );
  }

  const clients = (rows ?? []) as { id: string; business_name: string }[];
  const total = clients.length;

  if (total === 0) {
    return NextResponse.json({
      ok: true,
      message: "No clients to sync.",
      total: 0,
      succeeded: 0,
      failed: 0,
      failures: [] as Failure[],
      scope: scopeLabel,
    });
  }

  let accessToken: string;
  try {
    accessToken = await getGoogleAccessTokenFromRefresh();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[sync all] Google token:", e);
    return NextResponse.json({
      ok: false,
      message: `Google is not connected (${msg}). Use Connect Google, then try again.`,
      total,
      succeeded: 0,
      failed: total,
      failures: [] as Failure[],
      scope: scopeLabel,
    });
  }

  const failures: Failure[] = [];
  let succeeded = 0;

  for (const c of clients) {
    try {
      await syncClientMetrics(c.id, { accessToken, scope: metricsScope });
      succeeded += 1;
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      console.error("[sync all] client", c.id, c.business_name, err);
      failures.push({ id: c.id, name: c.business_name ?? "Unknown", error });
    }
  }

  let commsNote = "";
  const runBasecampAfter = parsed.kind === "full";
  if (runBasecampAfter) {
    try {
      const comm = await syncCommunicationAlertsFromBasecamp();
      if (comm.error) {
        commsNote = ` Basecamp communication sync skipped: ${comm.error}`;
        console.warn("[sync all]", commsNote);
      } else {
        commsNote = ` Communication insights & action items (Basecamp) refreshed for ${comm.clientsUpdated} client metrics row(s).`;
        console.log("[sync all]", commsNote.trim());
      }
    } catch (e) {
      commsNote = ` Communication sync error: ${e instanceof Error ? e.message : String(e)}`;
      console.warn("[sync all]", commsNote);
    }
  }

  const failed = failures.length;
  const sample = failures
    .slice(0, 3)
    .map((f) => `${f.name}: ${f.error}`)
    .join(" · ");

  let message: string;
  if (succeeded === total) {
    message = `Synced all ${total} client${total === 1 ? "" : "s"} (${scopeLabel}).${commsNote}`;
  } else if (succeeded === 0) {
    message = `Could not sync any clients (${failed} failed). ${sample || "See server logs."}${commsNote}`;
  } else {
    message = `Synced ${succeeded} of ${total} clients (${scopeLabel}).${failed ? ` ${failed} failed` : ""}${sample ? ` — ${sample}${failed > 3 ? "…" : ""}` : ""}${commsNote}`;
  }

  return NextResponse.json({
    ok: succeeded > 0,
    message,
    total,
    succeeded,
    failed,
    failures: failures.slice(0, 25),
    scope: scopeLabel,
  });
}
