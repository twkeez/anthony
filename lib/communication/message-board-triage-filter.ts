import type { CommunicationMessageBoardTriageRow } from "@/lib/communication/message-board-triage-types";
import { COMMUNICATION_WAITING_ON_CLIENT_TRIAGE_KEY } from "@/lib/communication/message-board-triage-types";
import type { CommunicationMessageBoardActivityItem } from "@/lib/agency-hub/communication-alerts";
import { messageBoardThreadKey } from "@/lib/communication/message-board-thread-key";

/**
 * Thread hidden by dismiss, or by snooze (until expiry — then hidden until 14+ days silence or thread changes).
 */
export function isMessageBoardThreadHiddenByTriage(
  clientId: string,
  item: CommunicationMessageBoardActivityItem,
  triage: readonly CommunicationMessageBoardTriageRow[],
  daysSinceLastContact: number | null,
  nowMs: number = Date.now(),
): boolean {
  const fp = messageBoardThreadKey(item);
  const updated = item.updatedAt.trim();
  for (const t of triage) {
    if (t.client_id !== clientId) continue;
    if (t.thread_key !== fp || t.thread_updated_at !== updated) continue;
    if (t.action === "dismiss") return true;
    if (t.action === "snooze" && t.snooze_until) {
      const untilMs = new Date(t.snooze_until).getTime();
      if (nowMs < untilMs) return true;
      const d = daysSinceLastContact;
      if (d != null && d >= 14) return false;
      return true;
    }
  }
  return false;
}

/** Whole-card "client waiting" suppression for the same last-message fingerprint. */
export function isWaitingOnClientTriageActive(
  clientId: string,
  lastMessageUpdatedAt: string | null | undefined,
  triage: readonly CommunicationMessageBoardTriageRow[],
  daysSinceLastContact: number | null,
  nowMs: number = Date.now(),
): boolean {
  const lu = lastMessageUpdatedAt?.trim() ?? "";
  if (!lu) return false;
  for (const t of triage) {
    if (t.client_id !== clientId) continue;
    if (t.thread_key !== COMMUNICATION_WAITING_ON_CLIENT_TRIAGE_KEY || t.thread_updated_at !== lu) continue;
    if (t.action === "dismiss") return true;
    if (t.action === "snooze" && t.snooze_until) {
      const untilMs = new Date(t.snooze_until).getTime();
      if (nowMs < untilMs) return true;
      const d = daysSinceLastContact;
      if (d != null && d >= 14) return false;
      return true;
    }
  }
  return false;
}
