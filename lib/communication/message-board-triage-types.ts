export type CommunicationMessageBoardTriageAction = "dismiss" | "snooze";

export type CommunicationMessageBoardTriageRow = {
  id: string;
  client_id: string;
  thread_key: string;
  thread_updated_at: string;
  action: CommunicationMessageBoardTriageAction;
  snooze_until: string | null;
  created_at?: string;
  updated_at?: string;
};

/** Reserved key: suppress "client waiting" red for this last-message fingerprint. */
export const COMMUNICATION_WAITING_ON_CLIENT_TRIAGE_KEY = "__waiting_on_client__";
