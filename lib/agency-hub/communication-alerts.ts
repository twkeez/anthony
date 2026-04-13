/** Stored in `client_metrics.communication_alerts` (jsonb). */
export type CommunicationTodoItem = {
  name: string;
  dueOn: string | null;
  daysLate: number;
  /** Basecamp bucket / project name when available. */
  projectName?: string;
};

/**
 * Latest activity on a Basecamp **message board** thread from `projects/:id/topics.json`
 * (most recently updated topic whose `topicable.type` is `Message`).
 */
export type CommunicationLastMessageSnapshot = {
  subject: string;
  /** Plain-text preview (HTML stripped server-side). */
  excerpt: string;
  /** ISO timestamp from Basecamp `updated_at`. */
  updatedAt: string;
  authorName?: string;
  /** Basecamp person id from `last_updater.id` (string for JSON / compares). */
  authorId?: string;
  /** From `last_updater.email_address` when the API includes it. */
  authorEmail?: string;
  /** Basecamp web URL for the message (when provided by API). */
  webUrl?: string;
};

export type CommunicationAlertsState = {
  overdueCount: number;
  mostOverdueDays: number;
  status: "red" | "yellow" | "green";
  tasks?: CommunicationTodoItem[];
  syncedAt?: string;
  /** Latest message-board thread activity for the mapped project, or null after sync if none. */
  lastMessage?: CommunicationLastMessageSnapshot | null;
  /**
   * Last message-board updater is not in the configured agency team (client / external waiting on you).
   * `false` when team list is empty (cannot infer). `null` when there is no message snapshot.
   */
  waitingForResponse?: boolean | null;
  /** Whole UTC days since `lastMessage.updatedAt`; null when no message thread. */
  daysSinceLastContact?: number | null;
  /** Display label for the last message author (name, or fallback from id). */
  lastMessageAuthor?: string | null;
  /** ISO timestamp of the latest message-board post from an internal (@beyond) author; null if last post was external or unknown. */
  last_internal_reply_at?: string | null;
  /** Whether the last message-board post was from an internal agency user (email @beyond domain or matched team list). */
  is_internal_author?: boolean | null;
};

export const EMPTY_COMMUNICATION_ALERTS: CommunicationAlertsState = {
  overdueCount: 0,
  mostOverdueDays: 0,
  status: "green",
  tasks: [],
};

/** Whole UTC calendar days from `iso` (message `updated_at`) to today; null if unknown or future-dated. */
export function daysSinceLastContactFromIso(iso: string | null | undefined): number | null {
  if (iso == null || String(iso).trim() === "") return null;
  const d = new Date(String(iso).trim());
  if (Number.isNaN(d.getTime())) return null;
  const utcDay = (x: Date) => Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate());
  const diffDays = Math.floor((utcDay(new Date()) - utcDay(d)) / 86400000);
  return diffDays >= 0 ? diffDays : null;
}

/**
 * Internal teammate: email domain is `beyond`, a subdomain of `beyond`, or `beyond.com` (and subdomains).
 * When `last_updater.email_address` is present it takes precedence over name/id lists.
 */
export function isBeyondInternalEmail(email: string | null | undefined): boolean {
  if (email == null || typeof email !== "string") return false;
  const e = email.trim().toLowerCase();
  if (e.endsWith("@beyond")) return true;
  const at = e.lastIndexOf("@");
  if (at < 0) return false;
  const domain = e.slice(at + 1);
  return (
    domain === "beyond" ||
    domain === "beyond.com" ||
    domain.endsWith(".beyond") ||
    domain.endsWith(".beyond.com")
  );
}

/**
 * Derives `waitingForResponse`, `daysSinceLastContact`, `lastMessageAuthor`, `last_internal_reply_at`,
 * and `is_internal_author` from the latest message topic. When `authorEmail` is set, it drives internal vs
 * external; otherwise agency team lists (names + ids) are used as a fallback.
 */
export function computeCommunicationResponsiveness(
  lastMessage: CommunicationLastMessageSnapshot | null,
  agencyTeamNames: readonly string[],
  agencyTeamIds: readonly string[],
): {
  waitingForResponse: boolean | null;
  daysSinceLastContact: number | null;
  lastMessageAuthor: string | null;
  last_internal_reply_at: string | null;
  is_internal_author: boolean | null;
} {
  const empty = {
    waitingForResponse: null as boolean | null,
    daysSinceLastContact: null as number | null,
    lastMessageAuthor: null as string | null,
    last_internal_reply_at: null as string | null,
    is_internal_author: null as boolean | null,
  };

  if (!lastMessage?.updatedAt) {
    return empty;
  }

  const daysSinceLastContact = daysSinceLastContactFromIso(lastMessage.updatedAt);
  const authorName = lastMessage.authorName?.trim() ?? "";
  const authorId = lastMessage.authorId?.trim() ?? "";
  const lastMessageAuthor =
    authorName !== "" ? authorName : authorId !== "" ? `Person ${authorId}` : null;

  const authorEmail = lastMessage.authorEmail?.trim() ?? "";
  const updatedAt = lastMessage.updatedAt;

  if (authorEmail !== "") {
    const internal = isBeyondInternalEmail(authorEmail);
    return {
      waitingForResponse: internal ? false : true,
      daysSinceLastContact,
      lastMessageAuthor,
      last_internal_reply_at: internal ? updatedAt : null,
      is_internal_author: internal,
    };
  }

  const teamConfigured = agencyTeamNames.length > 0 || agencyTeamIds.length > 0;
  if (!teamConfigured) {
    return {
      waitingForResponse: false,
      daysSinceLastContact,
      lastMessageAuthor,
      last_internal_reply_at: null,
      is_internal_author: null,
    };
  }

  if (authorName === "" && authorId === "") {
    return {
      waitingForResponse: null,
      daysSinceLastContact,
      lastMessageAuthor,
      last_internal_reply_at: null,
      is_internal_author: null,
    };
  }

  const idHit = authorId !== "" && agencyTeamIds.some((id) => id === authorId);
  const nameHit =
    authorName !== "" &&
    agencyTeamNames.some((n) => n.trim().toLowerCase() === authorName.toLowerCase());
  const isAgency = idHit || nameHit;
  const waitingForResponse = !isAgency;

  return {
    waitingForResponse,
    daysSinceLastContact,
    lastMessageAuthor,
    last_internal_reply_at: isAgency ? updatedAt : null,
    is_internal_author: isAgency,
  };
}

/** Hub / dashboards: overdue tasks or client waiting or stale contact window. */
export function communicationNeedsActionAttention(state: CommunicationAlertsState): boolean {
  if (state.waitingForResponse === true) return true;
  const d = state.daysSinceLastContact;
  if (d != null && Number.isFinite(d) && d >= 15) return true;
  return false;
}

function parseLastMessageJson(raw: unknown): CommunicationLastMessageSnapshot | null {
  if (raw == null) return null;
  if (typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const subject = typeof o.subject === "string" ? o.subject.trim() : "";
  const excerpt = typeof o.excerpt === "string" ? o.excerpt.trim() : "";
  const updatedAt = typeof o.updatedAt === "string" ? o.updatedAt.trim() : "";
  if (!subject || !updatedAt) return null;
  const authorName = typeof o.authorName === "string" ? o.authorName.trim() : undefined;
  const authorIdRaw = o.authorId;
  const authorId =
    typeof authorIdRaw === "number" && Number.isFinite(authorIdRaw)
      ? String(Math.trunc(authorIdRaw))
      : typeof authorIdRaw === "string" && authorIdRaw.trim() !== ""
        ? authorIdRaw.trim()
        : undefined;
  const webUrl = typeof o.webUrl === "string" ? o.webUrl.trim() : undefined;
  const authorEmailRaw = o.authorEmail ?? o.author_email;
  const authorEmail =
    typeof authorEmailRaw === "string" && authorEmailRaw.trim() !== "" ? authorEmailRaw.trim() : undefined;
  return {
    subject,
    excerpt: excerpt || "(No preview text.)",
    updatedAt,
    ...(authorName ? { authorName } : {}),
    ...(authorId ? { authorId } : {}),
    ...(authorEmail ? { authorEmail } : {}),
    ...(webUrl ? { webUrl } : {}),
  };
}

export function parseCommunicationAlertsJson(raw: unknown): CommunicationAlertsState | null {
  if (raw == null) return null;
  if (typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const overdueCount = Number(o.overdueCount);
  const mostOverdueDays = Number(o.mostOverdueDays);
  const status = o.status === "red" || o.status === "yellow" || o.status === "green" ? o.status : "green";
  const tasksRaw = o.tasks;
  const tasks: CommunicationTodoItem[] = [];
  if (Array.isArray(tasksRaw)) {
    for (const el of tasksRaw) {
      if (!el || typeof el !== "object") continue;
      const t = el as Record<string, unknown>;
      const name = typeof t.name === "string" ? t.name : "";
      const dueOn = typeof t.dueOn === "string" ? t.dueOn : t.dueOn == null ? null : String(t.dueOn);
      const daysLate = Number(t.daysLate);
      const projectName = typeof t.projectName === "string" ? t.projectName : undefined;
      if (!name || !Number.isFinite(daysLate)) continue;
      tasks.push({ name, dueOn, daysLate, ...(projectName ? { projectName } : {}) });
    }
  }
  const syncedAt = typeof o.syncedAt === "string" ? o.syncedAt : undefined;
  let lastMessage: CommunicationLastMessageSnapshot | null | undefined;
  if ("lastMessage" in o) {
    lastMessage = o.lastMessage === null ? null : parseLastMessageJson(o.lastMessage);
  }

  let waitingForResponse: boolean | null | undefined;
  if ("waitingForResponse" in o) {
    const w = o.waitingForResponse;
    if (w === null) waitingForResponse = null;
    else if (w === true) waitingForResponse = true;
    else if (w === false) waitingForResponse = false;
    else waitingForResponse = null;
  }

  let daysSinceLastContact: number | null | undefined;
  if ("daysSinceLastContact" in o) {
    const d = o.daysSinceLastContact;
    if (d === null) daysSinceLastContact = null;
    else if (typeof d === "number" && Number.isFinite(d)) daysSinceLastContact = Math.max(0, Math.round(d));
    else daysSinceLastContact = null;
  }

  let lastMessageAuthor: string | null | undefined;
  if ("lastMessageAuthor" in o) {
    const a = o.lastMessageAuthor;
    lastMessageAuthor = a === null ? null : typeof a === "string" ? a.trim() || null : null;
  }

  let last_internal_reply_at: string | null | undefined;
  if ("last_internal_reply_at" in o) {
    const t = o.last_internal_reply_at;
    last_internal_reply_at =
      t === null ? null : typeof t === "string" && t.trim() !== "" ? t.trim() : null;
  }

  let is_internal_author: boolean | null | undefined;
  if ("is_internal_author" in o) {
    const v = o.is_internal_author;
    if (v === null) is_internal_author = null;
    else if (v === true) is_internal_author = true;
    else if (v === false) is_internal_author = false;
    else is_internal_author = null;
  }

  return {
    overdueCount: Number.isFinite(overdueCount) ? Math.max(0, Math.round(overdueCount)) : 0,
    mostOverdueDays: Number.isFinite(mostOverdueDays) ? Math.max(0, Math.round(mostOverdueDays)) : 0,
    status,
    tasks: tasks.length ? tasks : [],
    ...(syncedAt ? { syncedAt } : {}),
    ...(lastMessage !== undefined ? { lastMessage } : {}),
    ...(waitingForResponse !== undefined ? { waitingForResponse } : {}),
    ...(daysSinceLastContact !== undefined ? { daysSinceLastContact } : {}),
    ...(lastMessageAuthor !== undefined ? { lastMessageAuthor } : {}),
    ...(last_internal_reply_at !== undefined ? { last_internal_reply_at } : {}),
    ...(is_internal_author !== undefined ? { is_internal_author } : {}),
  };
}

export function hasActiveCommunicationAlert(raw: unknown): boolean {
  const a = parseCommunicationAlertsJson(raw);
  if (!a) return false;
  return a.overdueCount > 0;
}
