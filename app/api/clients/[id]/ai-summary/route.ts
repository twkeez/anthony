import { NextResponse } from "next/server";

import { runClientVibeCheckAndSave } from "@/lib/ai/client-vibe-check";
import { ensureClientExists } from "@/lib/auth/ensure-client";

type Ctx = { params: Promise<{ id: string }> };

/** @deprecated Prefer `generateClientVibeCheck` server action; kept for existing clients calling POST. */
export async function POST(_request: Request, context: Ctx) {
  const { id: client_id } = await context.params;
  const scope = await ensureClientExists(client_id);
  if (scope) return scope;

  const result = await runClientVibeCheckAndSave(client_id);
  if (!result.ok) {
    const e = result.error.toLowerCase();
    const status =
      e.includes("no metrics row") || e.includes("client not found") || e.includes("missing client")
        ? 404
        : e.includes("google_gemini_api_key")
          ? 400
          : 500;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json({ ok: true, summary: result.summary });
}
