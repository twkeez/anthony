import { createHash } from "node:crypto";

/** When `GEMINI_DEBUG_LOGS=1`, logs model id and a short SHA-256 prefix of the prompt (not the raw prompt). */
export function logGeminiPromptDebug(model: string, prompt: string): void {
  if (process.env.GEMINI_DEBUG_LOGS?.trim() !== "1") return;
  const hash = createHash("sha256").update(prompt, "utf8").digest("hex").slice(0, 12);
  console.info(`[gemini] model=${model} prompt_sha256_12=${hash} len=${prompt.length}`);
}
