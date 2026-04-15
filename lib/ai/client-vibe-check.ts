import { GoogleGenerativeAI } from "@google/generative-ai";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { currentMetricMonthStart } from "@/lib/sync/communication-sync";

/** Inlined into the user turn — v1 `generateContent` rejects top-level `systemInstruction` from this SDK. */
const VIBE_SYSTEM_PROMPT = [
  "You are an Agency Director. Summarize account health in 2 sentences and provide one 'Next Step'.",
  "",
  "When the user message includes a 'Primary strategist voice' block, match that strategist's tone, vocabulary, and formality in your two sentences and the Next step line (suggested client-facing reply style).",
  "",
  "Use communication_alerts when choosing the Next Step:",
  "- If waitingForResponse is true, the client is waiting on the agency—prioritize replying, unblocking, or following up on Basecamp (not generic marketing tasks).",
  "- If daysSinceLastContact is a large number (or last message is stale), prioritize re-engagement or scheduling contact before chasing unrelated optimizations.",
  "- If waitingForResponse is false or null and contact is recent, lean on performance and operational metrics for the Next Step.",
].join("\n");

type VibeMetricsSnapshot = Record<string, unknown>;

export type ClientVibeCheckResult =
  | { ok: true; summary: string }
  | { ok: false; error: string };

/**
 * Resolves `GEMINI_MODEL` for the Generative Language **v1** API.
 * Gemini 1.5 ids are absent from v1; legacy values map to **2.5 Flash** (not Pro) to avoid low free-tier Pro quotas.
 * @see https://ai.google.dev/gemini-api/docs/models/gemini
 */
function geminiModel(): string {
  const raw = process.env.GEMINI_MODEL?.trim();
  const m = raw && raw !== "" ? raw : "gemini-2.5-flash";

  const legacyPro = new Set([
    "gemini-1.5-pro",
    "gemini-1.5-pro-latest",
    "gemini-1.5-pro-002",
  ]);
  const legacyFlash = new Set([
    "gemini-1.5-flash",
    "gemini-1.5-flash-latest",
    "gemini-1.5-flash-002",
    "gemini-1.5-flash-8b",
  ]);

  // Legacy "pro" ids → Flash: 2.5 Pro has much lower free-tier quotas; opt in with GEMINI_MODEL=gemini-2.5-pro.
  if (legacyPro.has(m)) return "gemini-2.5-flash";
  if (legacyFlash.has(m)) return "gemini-2.5-flash";
  return m;
}

function isRetryableGeminiRateLimit(message: string): boolean {
  return /429|Too Many Requests|Resource exhausted|quota exceeded|rate limit/i.test(message);
}

function strategistVoiceBlock(
  strategist: { full_name: string; writing_style_notes: string | null } | null,
): string {
  if (!strategist?.writing_style_notes?.trim()) {
    return [
      "Primary strategist voice:",
      "(No writing_style_notes on file for this client's assigned strategist — use a clear, professional Account Manager tone.)",
    ].join("\n");
  }
  return [
    "Primary strategist voice:",
    `- Strategist: ${strategist.full_name}`,
    "",
    "Emulate how this person communicates when you phrase the two sentences and the Next step (word choice, warmth, brevity, sign-off style):",
    strategist.writing_style_notes.trim(),
  ].join("\n");
}

function communicationPriorityLines(snapshot: VibeMetricsSnapshot): string {
  const raw = snapshot.communication_alerts;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return "communication_alerts: (missing or not an object) — infer what you can from the JSON below.";
  }
  const o = raw as Record<string, unknown>;
  const w = o.waitingForResponse;
  const d = o.daysSinceLastContact;
  const author = o.lastMessageAuthor;
  return [
    "Prioritize Next Step using these fields (also present inside the JSON):",
    `- waitingForResponse: ${JSON.stringify(w)}`,
    `- daysSinceLastContact: ${JSON.stringify(d)}`,
    `- lastMessageAuthor: ${JSON.stringify(author)}`,
  ].join("\n");
}

/**
 * Loads current-month `client_metrics`, asks Gemini for a director-style insight (metrics + communication),
 * and saves the reply to `ai_summary`.
 */
export async function runClientVibeCheckAndSave(clientId: string): Promise<ClientVibeCheckResult> {
  const id = String(clientId ?? "").trim();
  if (!id) return { ok: false, error: "Missing client id." };

  const apiKey = process.env.GOOGLE_GEMINI_API_KEY?.trim();
  if (!apiKey) {
    return {
      ok: false,
      error: "GOOGLE_GEMINI_API_KEY is not set. Add it to .env.local to enable strategy insights.",
    };
  }

  const supabase = getSupabaseAdmin();
  const metricMonth = currentMetricMonthStart();

  const { data: client, error: cErr } = await supabase
    .from("clients")
    .select("business_name, primary_strategist_id")
    .eq("id", id)
    .maybeSingle();

  if (cErr) return { ok: false, error: cErr.message };
  if (!client) return { ok: false, error: "Client not found." };

  const businessName =
    typeof (client as { business_name?: unknown }).business_name === "string"
      ? String((client as { business_name: string }).business_name).trim() || "Client"
      : "Client";

  const strategistIdRaw = (client as { primary_strategist_id?: unknown }).primary_strategist_id;
  const strategistId =
    strategistIdRaw != null && String(strategistIdRaw).trim() !== "" ? String(strategistIdRaw).trim() : null;

  let strategist: { full_name: string; writing_style_notes: string | null } | null = null;
  if (strategistId) {
    const { data: stRow, error: stErr } = await supabase
      .from("staff")
      .select("full_name, writing_style_notes")
      .eq("id", strategistId)
      .maybeSingle();
    if (!stErr && stRow) {
      strategist = {
        full_name: String((stRow as { full_name: string }).full_name ?? "").trim() || "Strategist",
        writing_style_notes:
          (stRow as { writing_style_notes: string | null }).writing_style_notes != null
            ? String((stRow as { writing_style_notes: string | null }).writing_style_notes)
            : null,
      };
    }
  }

  const { data: metricsRow, error: mErr } = await supabase
    .from("client_metrics")
    .select(
      [
        "metric_month",
        "ads_spend",
        "ads_conversions",
        "ads_clicks",
        "ads_impressions",
        "ads_ctr",
        "ads_average_cpc",
        "ads_search_impression_share",
        "ads_search_rank_lost_impression_share",
        "ads_search_budget_lost_impression_share",
        "ads_search_abs_top_impression_share",
        "ga4_sessions",
        "ga4_key_events",
        "ga4_engagement_rate",
        "ga4_alerts",
        "sitemap_url",
        "sitemap_status",
        "sitemap_last_downloaded",
        "organic_clicks",
        "organic_impressions",
        "top_organic_queries",
        "google_ads_alerts",
        "communication_alerts",
        "last_synced_at",
        "sync_error",
      ].join(", "),
    )
    .eq("client_id", id)
    .eq("metric_month", metricMonth)
    .maybeSingle();

  if (mErr) return { ok: false, error: mErr.message };
  if (!metricsRow) {
    return {
      ok: false,
      error: "No metrics row for the current month. Run Sync metrics first.",
    };
  }

  const snapshot = metricsRow as unknown as VibeMetricsSnapshot;
  const userContent = [
    `Client: ${businessName}`,
    `Metric month: ${metricMonth}`,
    "",
    strategistVoiceBlock(strategist),
    "",
    communicationPriorityLines(snapshot),
    "",
    "Full client_metrics (JSON; includes communication_alerts for Basecamp / last message context):",
    JSON.stringify(snapshot, null, 2),
    "",
    "Respond in plain text only: exactly two sentences on account health, then one clear 'Next step:' line for the Account Manager.",
  ].join("\n");

  const modelInput = [VIBE_SYSTEM_PROMPT, "", userContent].join("\n");

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel(
      {
        model: geminiModel(),
        generationConfig: {
          temperature: 0.35,
          // Headroom for 2 sentences + Next step; 280 caused mid-sentence MAX_TOKENS cutoffs.
          maxOutputTokens: 1024,
        },
      },
      { apiVersion: "v1" },
    );

    const result = await (async () => {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          return await model.generateContent(modelInput);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          if (attempt === 0 && isRetryableGeminiRateLimit(msg)) {
            await new Promise((r) => setTimeout(r, 3200));
            continue;
          }
          throw e;
        }
      }
      throw new Error("Gemini generateContent failed after retries.");
    })();

    const text = result.response.text()?.trim();
    if (!text) return { ok: false, error: "Empty AI response." };
    if (text.length < 10) return { ok: false, error: "AI response too short." };

    const now = new Date().toISOString();
    const { data: updated, error: uErr } = await supabase
      .from("client_metrics")
      .update({ ai_summary: text, updated_at: now })
      .eq("client_id", id)
      .eq("metric_month", metricMonth)
      .select("client_id")
      .maybeSingle();

    if (uErr) return { ok: false, error: uErr.message };
    if (!updated) {
      return { ok: false, error: "Could not update client_metrics (no matching row)." };
    }

    return { ok: true, summary: text };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const rateOrQuota = /429|quota|Too Many Requests/i.test(msg);
    const hint = rateOrQuota
      ? geminiModel().includes("pro")
        ? " (gemini-2.5-pro has tight free-tier quotas; use GEMINI_MODEL=gemini-2.5-flash or enable billing.)"
        : " (Wait and retry, or see https://ai.google.dev/gemini-api/docs/rate-limits )"
      : "";
    return { ok: false, error: `Gemini error: ${msg.slice(0, 400)}${hint}` };
  }
}
