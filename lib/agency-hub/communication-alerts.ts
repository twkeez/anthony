import type { CommunicationInternalPartyForClassification } from "@/lib/communication/internal-parties-types";
import type { StaffMemberForClassification } from "@/lib/staff/staff-types";

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

/** Best-effort classification of whether a client post needs a substantive reply (heuristic, not AI). */
export type CommunicationActionability = "likely_actionable" | "unclear" | "possibly_informational";

/** Message-board threads where the last activity is from a client/external author (awaiting team). */
export type UnansweredClientThreadSnapshot = {
  subject: string;
  excerpt: string;
  updatedAt: string;
  authorName?: string;
  webUrl?: string;
  /** Whole UTC days since `updatedAt` (longer = longer without team reply on this thread). */
  daysWaiting: number;
  actionability: CommunicationActionability;
  suggestedAction: string;
  /** One-line heuristic digest (sync-time). */
  summary?: string;
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
   * Last message-board updater is not matched as agency (client / external waiting on you).
   * `null` when there is no message snapshot or author could not be classified; `false` when classified internal or when lists are empty (see `computeCommunicationResponsiveness`).
   */
  waitingForResponse?: boolean | null;
  /** Whole UTC days since `lastMessage.updatedAt`; null when no message thread. */
  daysSinceLastContact?: number | null;
  /** Display label for the last message author (name, or fallback from id). */
  lastMessageAuthor?: string | null;
  /** ISO timestamp of the latest message-board post from an internal (@beyond) author; null if last post was external or unknown. */
  last_internal_reply_at?: string | null;
  /** Whether the last message-board post was from an internal agency user (staff table, @beyond email, or legacy env lists). */
  is_internal_author?: boolean | null;
  /** Message threads whose latest activity is from a client/external author (newest sync only; capped per client). */
  unansweredClientThreads?: UnansweredClientThreadSnapshot[];
  /**
   * Message-board threads updated inside the rolling window, newest first, each with client vs agency label
   * and heuristic summary / next steps.
   */
  messageBoardActivity?: CommunicationMessageBoardActivityItem[];
};

export const EMPTY_COMMUNICATION_ALERTS: CommunicationAlertsState = {
  overdueCount: 0,
  mostOverdueDays: 0,
  status: "green",
  tasks: [],
};

/** Default rolling window (days) for which message-board topics are considered in sync and activity keys. */
export const COMMUNICATION_MESSAGE_BOARD_ROLLING_DAYS = 60;

/**
 * Keeps only topics whose `updatedAt` falls within the rolling window (newest-first order preserved).
 */
export function filterMessageBoardSnapshotsRolling(
  snapshots: readonly CommunicationLastMessageSnapshot[],
  rollingDays: number = COMMUNICATION_MESSAGE_BOARD_ROLLING_DAYS,
): CommunicationLastMessageSnapshot[] {
  const cutoffMs = Date.now() - rollingDays * 86_400_000;
  return snapshots.filter((s) => {
    const t = new Date(String(s.updatedAt).trim()).getTime();
    return Number.isFinite(t) && t >= cutoffMs;
  });
}

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

export type MessageBoardAuthorSide = "internal" | "external" | "unknown";

/** One message-board thread in the rolling window, with agency vs client labeling and triage hints (heuristic, not LLM). */
export type CommunicationMessageBoardActivityItem = CommunicationLastMessageSnapshot & {
  authorSide: MessageBoardAuthorSide;
  /** Short plain-language digest for dashboards. */
  summary: string;
  /** What to do next (same spirit as `UnansweredClientThreadSnapshot.suggestedAction`). */
  nextSteps: string;
};

/** Options for matching agency authors (active `staff`, manual internal parties, plus optional legacy env lists). */
export type CommunicationClassificationOpts = {
  staff: readonly StaffMemberForClassification[];
  /** Manual roster: contractors / partners counted as internal for reply vs waiting-on-you logic. */
  extraInternalParties: readonly CommunicationInternalPartyForClassification[];
  agencyTeamNames: readonly string[];
  agencyTeamIds: readonly string[];
};

/**
 * Classifies the last poster on a message-board topic snapshot (same rules as responsiveness).
 * `external` = client / vendor / anyone not matched as agency.
 */
export function classifyMessageBoardAuthorSide(
  snap: Pick<CommunicationLastMessageSnapshot, "authorEmail" | "authorName" | "authorId">,
  opts: CommunicationClassificationOpts,
): MessageBoardAuthorSide {
  const extras = opts.extraInternalParties.filter((p) => p.is_active);

  const authorEmail = snap.authorEmail?.trim() ?? "";
  if (authorEmail !== "") {
    const normalized = authorEmail.toLowerCase();
    const staffEmailHit = opts.staff.some(
      (s) => s.is_active && s.email.trim().toLowerCase() === normalized,
    );
    if (staffEmailHit) return "internal";
    const extraEmailHit = extras.some((p) => p.email && p.email === normalized);
    if (extraEmailHit) return "internal";
    if (isBeyondInternalEmail(authorEmail)) return "internal";
    return "external";
  }

  const activeStaff = opts.staff.filter((s) => s.is_active);
  const staffConfigured = activeStaff.length > 0;
  const extrasConfigured = extras.length > 0;
  const legacyConfigured = opts.agencyTeamNames.length > 0 || opts.agencyTeamIds.length > 0;
  if (!staffConfigured && !extrasConfigured && !legacyConfigured) return "unknown";

  const authorName = snap.authorName?.trim() ?? "";
  const authorId = snap.authorId?.trim() ?? "";
  if (authorName === "" && authorId === "") return "unknown";

  const staffIdHit =
    authorId !== "" &&
    activeStaff.some((s) => {
      const bid = (s.basecamp_id ?? "").trim();
      return bid !== "" && bid === authorId;
    });
  const lowerAuthorName = authorName.toLowerCase();
  const staffNameHit =
    authorName !== "" &&
    activeStaff.some((s) => {
      const handle = (s.basecamp_name_handle ?? "").trim().toLowerCase();
      const full = (s.full_name ?? "").trim().toLowerCase();
      return (
        (handle !== "" && handle === lowerAuthorName) || (full !== "" && full === lowerAuthorName)
      );
    });

  const extraIdHit =
    authorId !== "" &&
    extras.some((p) => {
      const bid = (p.basecamp_id ?? "").trim();
      return bid !== "" && bid === authorId;
    });
  const extraNameHit =
    authorName !== "" &&
    extras.some((p) => {
      const n = (p.display_name ?? "").trim().toLowerCase();
      return n !== "" && n === lowerAuthorName;
    });

  const legacyIdHit = authorId !== "" && opts.agencyTeamIds.some((id) => id === authorId);
  const legacyNameHit =
    authorName !== "" &&
    opts.agencyTeamNames.some((n) => n.trim().toLowerCase() === lowerAuthorName);

  if (staffIdHit || staffNameHit || extraIdHit || extraNameHit || legacyIdHit || legacyNameHit) return "internal";
  return "external";
}

const MAX_UNANSWERED_THREADS_PER_CLIENT = 20;
const MAX_MESSAGE_BOARD_ACTIVITY_ITEMS = 25;

function clipText(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

/**
 * Plain-language one-liner for a message-board post (heuristic; not an LLM summary).
 */
export function summarizeMessageBoardPost(
  snap: Pick<CommunicationLastMessageSnapshot, "subject" | "excerpt">,
  side: MessageBoardAuthorSide,
): string {
  const excerpt = String(snap.excerpt ?? "")
    .replace(/^\(No preview text\.\)$/i, "")
    .trim();
  const subject = String(snap.subject ?? "").trim();
  const who =
    side === "internal" ? "Agency" : side === "external" ? "Client" : "Unknown sender";
  const body = clipText(excerpt, 220);
  const subj = clipText(subject, 80);
  if (body) return `${who}: “${subj}” — ${body}`;
  return `${who} posted on “${subj}”.`;
}

export function nextStepsForMessageBoardPost(
  side: MessageBoardAuthorSide,
  subject: string,
  excerpt: string,
): string {
  if (side === "internal") {
    return "No client reply needed from this post alone; follow up if the client asks a new question.";
  }
  if (side === "unknown") {
    return "Confirm the sender under Team / Internal contacts so “waiting on you” is accurate, then reply if needed.";
  }
  return inferCommunicationActionHint(subject, excerpt).suggestedAction;
}

/**
 * Rolling-window timeline (newest first). Snapshots should already be filtered by date and sorted newest-first.
 */
export function buildMessageBoardActivityTimeline(
  snapshots: readonly CommunicationLastMessageSnapshot[],
  opts: CommunicationClassificationOpts,
  maxItems: number = MAX_MESSAGE_BOARD_ACTIVITY_ITEMS,
): CommunicationMessageBoardActivityItem[] {
  const out: CommunicationMessageBoardActivityItem[] = [];
  for (const snap of snapshots) {
    if (out.length >= maxItems) break;
    if (!snap.updatedAt || !snap.subject?.trim()) continue;
    const authorSide = classifyMessageBoardAuthorSide(snap, opts);
    const summary = summarizeMessageBoardPost(snap, authorSide);
    const nextSteps = nextStepsForMessageBoardPost(authorSide, snap.subject, snap.excerpt);
    out.push({ ...snap, authorSide, summary, nextSteps });
  }
  return out;
}

/**
 * Heuristic hints for triage (no LLM). Tune keywords to your agency’s patterns.
 */
export function inferCommunicationActionHint(
  subject: string,
  excerpt: string,
): { actionability: CommunicationActionability; suggestedAction: string } {
  const combined = `${subject}\n${excerpt}`.toLowerCase();
  const trimmed = combined.replace(/\s+/g, " ").trim();
  const short = trimmed.length < 42;

  const looksQuestion =
    combined.includes("?") ||
    /\b(please|can you|could you|would you|need you|when can|let me know|lmk|thoughts\?|ok to|okay to)\b/.test(
      combined,
    );
  const looksRequest =
    /\b(need|request|review|approve|feedback|confirm|urgent|asap|deadline|help with|send over|share the|follow up)\b/.test(
      combined,
    );

  if (looksQuestion || looksRequest) {
    const suggestedAction = looksQuestion
      ? "Reply on Basecamp with a direct answer or a clear timeline."
      : "Acknowledge on Basecamp and outline who will do what by when.";
    return { actionability: "likely_actionable", suggestedAction };
  }

  if (short && !combined.includes("?")) {
    return {
      actionability: "possibly_informational",
      suggestedAction: "Optional: a short acknowledgment so the client knows you saw it.",
    };
  }

  return {
    actionability: "unclear",
    suggestedAction: "Read the thread on Basecamp and decide if a response is required.",
  };
}

/**
 * From one page of message topics (newest first), threads whose last updater is external — awaiting team.
 * Returned list is sorted newest `updatedAt` first (rolling window applied upstream).
 */
export function buildUnansweredClientThreadsFromSnapshots(
  snapshots: readonly CommunicationLastMessageSnapshot[],
  opts: CommunicationClassificationOpts,
): UnansweredClientThreadSnapshot[] {
  const out: UnansweredClientThreadSnapshot[] = [];
  const seen = new Set<string>();

  for (const snap of snapshots) {
    if (!snap.updatedAt || !snap.subject?.trim()) continue;
    const side = classifyMessageBoardAuthorSide(snap, opts);
    if (side !== "external") continue;

    const daysWaiting = daysSinceLastContactFromIso(snap.updatedAt);
    if (daysWaiting == null) continue;

    const dedupeKey = `${snap.subject.trim()}\0${snap.updatedAt}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    const { actionability, suggestedAction } = inferCommunicationActionHint(snap.subject, snap.excerpt);
    const authorName = snap.authorName?.trim();
    const summary = summarizeMessageBoardPost(snap, "external");
    out.push({
      subject: snap.subject.trim(),
      excerpt: snap.excerpt?.trim() || "(No preview text.)",
      updatedAt: snap.updatedAt,
      ...(authorName ? { authorName } : {}),
      ...(snap.webUrl ? { webUrl: snap.webUrl } : {}),
      daysWaiting,
      actionability,
      suggestedAction,
      summary,
    });
  }

  out.sort((a, b) => {
    const ta = new Date(a.updatedAt).getTime();
    const tb = new Date(b.updatedAt).getTime();
    return (Number.isFinite(tb) ? tb : 0) - (Number.isFinite(ta) ? ta : 0);
  });
  return out.slice(0, MAX_UNANSWERED_THREADS_PER_CLIENT);
}

/**
 * Derives `waitingForResponse`, `daysSinceLastContact`, `lastMessageAuthor`, `last_internal_reply_at`,
 * and `is_internal_author` from the latest message topic. When `authorEmail` is set, staff emails and Beyond-domain
 * rules apply; otherwise active staff Basecamp id/handle/name plus legacy env lists are used.
 */
export function computeCommunicationResponsiveness(
  lastMessage: CommunicationLastMessageSnapshot | null,
  opts: CommunicationClassificationOpts,
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

  const updatedAt = lastMessage.updatedAt;
  const side = classifyMessageBoardAuthorSide(lastMessage, opts);

  if (side === "internal") {
    return {
      waitingForResponse: false,
      daysSinceLastContact,
      lastMessageAuthor,
      last_internal_reply_at: updatedAt,
      is_internal_author: true,
    };
  }

  if (side === "external") {
    return {
      waitingForResponse: true,
      daysSinceLastContact,
      lastMessageAuthor,
      last_internal_reply_at: null,
      is_internal_author: false,
    };
  }

  const staffConfigured = opts.staff.some((s) => s.is_active);
  const extrasConfigured = opts.extraInternalParties.some((p) => p.is_active);
  const legacyConfigured = opts.agencyTeamNames.length > 0 || opts.agencyTeamIds.length > 0;
  if (!staffConfigured && !extrasConfigured && !legacyConfigured) {
    return {
      waitingForResponse: false,
      daysSinceLastContact,
      lastMessageAuthor,
      last_internal_reply_at: null,
      is_internal_author: null,
    };
  }

  return {
    waitingForResponse: null,
    daysSinceLastContact,
    lastMessageAuthor,
    last_internal_reply_at: null,
    is_internal_author: null,
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

function parseCommunicationMessageBoardActivityItemJson(raw: unknown): CommunicationMessageBoardActivityItem | null {
  const base = parseLastMessageJson(raw);
  if (!base) return null;
  const o = raw as Record<string, unknown>;
  const sideRaw = o.authorSide;
  const authorSide: MessageBoardAuthorSide =
    sideRaw === "internal" || sideRaw === "external" || sideRaw === "unknown" ? sideRaw : "unknown";
  const summary =
    typeof o.summary === "string" && o.summary.trim() !== ""
      ? o.summary.trim()
      : summarizeMessageBoardPost(base, authorSide);
  const nextSteps =
    typeof o.nextSteps === "string" && o.nextSteps.trim() !== ""
      ? o.nextSteps.trim()
      : nextStepsForMessageBoardPost(authorSide, base.subject, base.excerpt);
  return { ...base, authorSide, summary, nextSteps };
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

  let unansweredClientThreads: UnansweredClientThreadSnapshot[] | undefined;
  const uRaw = o.unansweredClientThreads;
  if (Array.isArray(uRaw) && uRaw.length > 0) {
    const arr: UnansweredClientThreadSnapshot[] = [];
    for (const el of uRaw) {
      if (!el || typeof el !== "object") continue;
      const u = el as Record<string, unknown>;
      const subject = typeof u.subject === "string" ? u.subject.trim() : "";
      const excerpt = typeof u.excerpt === "string" ? u.excerpt.trim() : "";
      const updatedAt = typeof u.updatedAt === "string" ? u.updatedAt.trim() : "";
      const daysWaiting = Number(u.daysWaiting);
      const act = u.actionability;
      const actionability: CommunicationActionability =
        act === "likely_actionable" || act === "possibly_informational" || act === "unclear" ? act : "unclear";
      const suggestedAction =
        typeof u.suggestedAction === "string" && u.suggestedAction.trim() !== ""
          ? u.suggestedAction.trim()
          : "Read the thread on Basecamp and decide if a response is required.";
      const authorName = typeof u.authorName === "string" ? u.authorName.trim() : undefined;
      const webUrl = typeof u.webUrl === "string" ? u.webUrl.trim() : undefined;
      const summary =
        typeof u.summary === "string" && u.summary.trim() !== "" ? u.summary.trim() : undefined;
      if (!subject || !updatedAt || !Number.isFinite(daysWaiting)) continue;
      arr.push({
        subject,
        excerpt: excerpt || "(No preview text.)",
        updatedAt,
        daysWaiting: Math.max(0, Math.round(daysWaiting)),
        actionability,
        suggestedAction,
        ...(authorName ? { authorName } : {}),
        ...(webUrl ? { webUrl } : {}),
        ...(summary ? { summary } : {}),
      });
    }
    if (arr.length > 0) unansweredClientThreads = arr;
  }

  let messageBoardActivity: CommunicationMessageBoardActivityItem[] | undefined;
  const mRaw = o.messageBoardActivity;
  if (Array.isArray(mRaw) && mRaw.length > 0) {
    const arr: CommunicationMessageBoardActivityItem[] = [];
    for (const el of mRaw) {
      const item = parseCommunicationMessageBoardActivityItemJson(el);
      if (item) arr.push(item);
    }
    if (arr.length > 0) messageBoardActivity = arr;
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
    ...(unansweredClientThreads !== undefined ? { unansweredClientThreads } : {}),
    ...(messageBoardActivity !== undefined ? { messageBoardActivity } : {}),
  };
}

export function hasActiveCommunicationAlert(raw: unknown): boolean {
  const a = parseCommunicationAlertsJson(raw);
  if (!a) return false;
  return a.overdueCount > 0;
}
