/** Row in `public.communication_internal_parties`. */
export type CommunicationInternalPartyRow = {
  id: string;
  email: string | null;
  basecamp_id: string | null;
  display_name: string | null;
  note: string | null;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
};

/** Subset passed into message-board author classification. */
export type CommunicationInternalPartyForClassification = Pick<
  CommunicationInternalPartyRow,
  "email" | "basecamp_id" | "display_name" | "is_active"
>;
