"use server";

import { runClientVibeCheckAndSave, type ClientVibeCheckResult } from "@/lib/ai/client-vibe-check";

/**
 * Phase 4 — AI Client Insights: director-style summary + next step, saved to `client_metrics.ai_summary`.
 */
export async function generateClientVibeCheck(clientId: string): Promise<ClientVibeCheckResult> {
  return runClientVibeCheckAndSave(clientId);
}
