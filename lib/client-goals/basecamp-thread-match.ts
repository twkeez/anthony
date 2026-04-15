import type { CommunicationAlertsState } from "@/lib/agency-hub/communication-alerts";

export type RankedBasecampThread = {
  subject: string;
  excerpt: string;
  webUrl?: string;
  updatedAt?: string;
  score: number;
};

function norm(s: string): string {
  return s.trim().toLowerCase();
}

function keywordScore(text: string, keywords: string[]): number {
  const t = norm(text);
  if (!t || keywords.length === 0) return 0;
  let score = 0;
  for (const kw of keywords) {
    const k = norm(kw);
    if (k.length < 2) continue;
    if (t.includes(k)) score += 1;
  }
  return score;
}

/**
 * Collects message-board style threads from `communication_alerts` and ranks by keyword overlap
 * on subject + excerpt (best-effort; sync payload shape may vary by version).
 */
export function rankBasecampThreadsByKeywords(
  comm: CommunicationAlertsState | null | undefined,
  keywords: string[],
  limit = 3,
): RankedBasecampThread[] {
  if (!comm) return [];
  const kws = keywords.map((k) => String(k).trim()).filter((k) => k.length > 0);
  if (kws.length === 0) return [];

  const candidates: RankedBasecampThread[] = [];
  const seen = new Set<string>();

  const push = (subject: string, excerpt: string, webUrl?: string, updatedAt?: string) => {
    const sub = subject.trim();
    if (!sub) return;
    const dedupe = `${sub}\0${updatedAt ?? ""}`;
    if (seen.has(dedupe)) return;
    seen.add(dedupe);
    const hay = `${sub} ${excerpt ?? ""}`;
    const score = keywordScore(hay, kws);
    candidates.push({
      subject: sub,
      excerpt: excerpt?.trim() || "",
      ...(webUrl ? { webUrl } : {}),
      ...(updatedAt ? { updatedAt } : {}),
      score,
    });
  };

  const activity = comm.messageBoardActivity ?? [];
  for (const a of activity) {
    push(a.subject, a.excerpt, a.webUrl, a.updatedAt);
  }

  const unanswered = comm.unansweredClientThreads ?? [];
  for (const u of unanswered) {
    push(u.subject, u.excerpt, u.webUrl, u.updatedAt);
  }

  if (comm.lastMessage?.subject) {
    push(comm.lastMessage.subject, comm.lastMessage.excerpt, comm.lastMessage.webUrl, comm.lastMessage.updatedAt);
  }

  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const ta = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
    const tb = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
    return tb - ta;
  });

  const positive = candidates.filter((c) => c.score > 0);
  const pool = positive.length > 0 ? positive : candidates;
  return pool.slice(0, limit);
}
