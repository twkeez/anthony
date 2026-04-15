import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

import { ensureClientExists } from "@/lib/auth/ensure-client";
import { logGeminiPromptDebug } from "@/lib/gemini/log-prompt-meta";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: Ctx) {
  try {
    const { id: clientId } = await context.params;
    const scope = await ensureClientExists(clientId);
    if (scope) return scope;

    const apiKey = process.env.GOOGLE_GEMINI_API_KEY?.trim();
    if (!apiKey) return NextResponse.json({ error: "GOOGLE_GEMINI_API_KEY is not set." }, { status: 400 });

    const supabase = getSupabaseAdmin();
    const [{ data: client }, { data: metrics }, { data: goals }] = await Promise.all([
      supabase.from("clients").select("business_name").eq("id", clientId).maybeSingle(),
      supabase.from("client_metrics").select("*").eq("client_id", clientId).order("metric_month", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("client_goals").select("goal_type, target_value, metric_target_column, intent_statement, status").eq("client_id", clientId),
    ]);
    if (!client || !metrics) {
      return NextResponse.json({ error: "Missing client or metrics for recommendation." }, { status: 404 });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const modelName = "gemini-2.5-flash";
    const model = genAI.getGenerativeModel({ model: modelName }, { apiVersion: "v1" });
    const prompt = [
      "You are Anthony, an agency strategy analyst.",
      "Given this snapshot, write one concise strategic recommendation in 4-6 sentences.",
      "Focus on practical next actions, tradeoffs, and expected impact.",
      "Tone: executive but direct.",
      "",
      `Client: ${String((client as { business_name?: string }).business_name ?? "Client")}`,
      "",
      "Current metrics JSON:",
      JSON.stringify(metrics, null, 2),
      "",
      "Client goals JSON:",
      JSON.stringify(goals ?? [], null, 2),
    ].join("\n");
    logGeminiPromptDebug(modelName, prompt);
    const result = await model.generateContent(prompt);
    const text = result.response.text()?.trim() ?? "";
    if (!text) return NextResponse.json({ error: "Empty recommendation." }, { status: 502 });
    return NextResponse.json({ recommendation: text });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
