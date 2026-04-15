import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse, type NextRequest } from "next/server";

import { logGeminiPromptDebug } from "@/lib/gemini/log-prompt-meta";

type Body = {
  block_title: string;
  block_content: string;
  business_name?: string;
};

function modelName(): string {
  const raw = process.env.GEMINI_MODEL?.trim();
  if (!raw) return "gemini-2.5-flash";
  if (raw.startsWith("gemini-1.5")) return "gemini-2.5-flash";
  return raw;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Body;
    const title = String(body.block_title ?? "").trim();
    const content = String(body.block_content ?? "").trim();
    const client = String(body.business_name ?? "the client").trim();
    if (!title || !content) {
      return NextResponse.json({ error: "Missing block_title or block_content." }, { status: 400 });
    }
    const key = process.env.GOOGLE_GEMINI_API_KEY?.trim();
    if (!key) {
      return NextResponse.json({ error: "GOOGLE_GEMINI_API_KEY is not set." }, { status: 400 });
    }

    const genAI = new GoogleGenerativeAI(key);
    const resolvedModel = modelName();
    const model = genAI.getGenerativeModel({ model: resolvedModel }, { apiVersion: "v1" });
    const prompt = [
      "Rewrite this report block for a client-facing monthly report.",
      "Tone: confident, clear, no hype, professional agency voice.",
      "Output exactly one concise paragraph and 3 bullet points.",
      `Client: ${client}`,
      `Block: ${title}`,
      "",
      content,
    ].join("\n");
    logGeminiPromptDebug(resolvedModel, prompt);
    const res = await model.generateContent(prompt);
    const rewritten = res.response.text()?.trim() ?? "";
    if (!rewritten) {
      return NextResponse.json({ error: "Gemini returned empty output." }, { status: 502 });
    }
    return NextResponse.json({ rewritten });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
