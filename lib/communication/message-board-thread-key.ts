import type { CommunicationMessageBoardActivityItem } from "@/lib/agency-hub/communication-alerts";

/**
 * Stable key for triage rows: prefer Basecamp URL, else subject + updated_at.
 */
export function messageBoardThreadKey(
  item: Pick<CommunicationMessageBoardActivityItem, "webUrl" | "subject" | "updatedAt">,
): string {
  const url = item.webUrl?.trim();
  if (url) return `url:${url}`;
  return `sub:${item.subject.trim()}\0${item.updatedAt.trim()}`;
}
