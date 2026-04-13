import { Buffer } from "node:buffer";
import type { CommunicationLastMessageSnapshot } from "@/lib/agency-hub/communication-alerts";

const DEFAULT_ACCOUNT_ID = "2175055";
/** Basecamp requires a static User-Agent string identifying the integration. */
const USER_AGENT = "anthony-agencypulse (tom@beyondindigo.com)";
const BASECAMP_FETCH_TIMEOUT_MS = 10_000;

export type Basecamp2Project = {
  /** Basecamp project id (string for DB / selects). */
  id: string;
  name: string;
};

export const OVERDUE_GROUP_KEYS = [
  "under_a_week_late",
  "over_a_week_late",
  "over_a_month_late",
  "over_three_months_late",
] as const;

export type OverdueTodoGroupKey = (typeof OVERDUE_GROUP_KEYS)[number];

export type NormalizedOverdueTodo = {
  projectId: string;
  title: string;
  dueOn: string | null;
  /** Calendar days past due (UTC date vs due date). */
  daysLate: number;
  group: OverdueTodoGroupKey;
  projectName?: string;
};

export type OverdueTodosReport = Record<OverdueTodoGroupKey, NormalizedOverdueTodo[]>;

export function getBasecampAccountId(): string {
  const raw = process.env.BASECAMP_ACCOUNT_ID?.trim();
  return raw && raw !== "" ? raw : DEFAULT_ACCOUNT_ID;
}

/** Trim and strip a single pair of surrounding quotes from .env values. */
function normalizeEnvSecret(raw: string | undefined): string {
  if (raw == null) return "";
  let s = raw.trim();
  if (
    (s.startsWith('"') && s.endsWith('"') && s.length >= 2) ||
    (s.startsWith("'") && s.endsWith("'") && s.length >= 2)
  ) {
    s = s.slice(1, -1).trim();
  }
  return s;
}

function basicAuthHeader(user: string, password: string): string {
  return `Basic ${Buffer.from(`${user}:${password}`, "utf8").toString("base64")}`;
}

function getBasecampBasicUser(): string {
  const explicit = normalizeEnvSecret(process.env.BASECAMP_BASIC_USER);
  if (explicit) return explicit;
  const email = normalizeEnvSecret(process.env.BASECAMP_USER_EMAIL);
  return email;
}

function getBasecampPassword(): string {
  return normalizeEnvSecret(process.env.BASECAMP_PASSWORD);
}

/** Hard-coded account segment for overdue + personal-fallback URLs (per bulletproof config). */
const OVERDUE_BULLETPROOF_ACCOUNT = "2175055";
const BC_OVERDUE_REPORT_URL = `https://basecamp.com/${OVERDUE_BULLETPROOF_ACCOUNT}/api/v1/reports/todos/overdue.json`;
const BC_PERSONAL_TODO_LISTS_URL = `https://basecamp.com/${OVERDUE_BULLETPROOF_ACCOUNT}/api/v1/people/me/todo_lists.json`;
const BC_PERSONAL_ASSIGNED_TODOS_URL = `https://basecamp.com/${OVERDUE_BULLETPROOF_ACCOUNT}/api/v1/people/me/assigned_todos.json`;

/**
 * Overdue report + `/people/me/*` fallbacks: **HTTP Basic only** —
 * `Authorization: Basic ` + `Buffer.from(username + ":" + password).toString("base64")`.
 */
function buildBulletproofOverdueHeaders(): Record<string, string> {
  if (normalizeEnvSecret(process.env.BASECAMP_ACCESS_TOKEN)) {
    console.warn(
      "[Basecamp overdue] BASECAMP_ACCESS_TOKEN is set; overdue endpoints still use Basic auth only (email/user + password).",
    );
  }
  const username = getBasecampBasicUser();
  const password = getBasecampPassword();
  if (!username || !password) {
    throw new Error(
      "Overdue report requires HTTP Basic: set BASECAMP_USER_EMAIL (or BASECAMP_BASIC_USER) and BASECAMP_PASSWORD.",
    );
  }
  return {
    Authorization: `Basic ${Buffer.from(`${username}:${password}`, "utf8").toString("base64")}`,
    "User-Agent": USER_AGENT,
    Accept: "application/json",
  };
}

function logOverdueHttpFailure(context: string, res: Response): void {
  console.error(`[Basecamp overdue] ${context} — HTTP`, res.status, res.statusText);
}

function buildAuthHeaders(): Record<string, string> {
  const bearer = normalizeEnvSecret(process.env.BASECAMP_ACCESS_TOKEN);
  if (bearer) {
    return {
      Authorization: `Bearer ${bearer}`,
      "User-Agent": USER_AGENT,
      Accept: "application/json",
    };
  }

  const user = getBasecampBasicUser();
  const password = getBasecampPassword();
  if (!user) {
    throw new Error(
      "Set BASECAMP_USER_EMAIL (or BASECAMP_BASIC_USER) and BASECAMP_PASSWORD for Basic Auth, or BASECAMP_ACCESS_TOKEN for Bearer.",
    );
  }

  return {
    Authorization: basicAuthHeader(user, password),
    "User-Agent": USER_AGENT,
    Accept: "application/json",
  };
}

/** Safe for logs: scheme + credential length, never the secret itself. */
function redactAuthHeaderForLog(authorization: string | undefined): string {
  if (authorization == null || authorization === "") {
    return "<empty>";
  }
  if (authorization.startsWith("Bearer ")) {
    const t = authorization.slice(7).trim();
    return `Bearer <redacted len=${t.length} nonempty=${t.length > 0}>`;
  }
  if (authorization.startsWith("Basic ")) {
    const t = authorization.slice(6).trim();
    return `Basic <redacted len=${t.length} nonempty=${t.length > 0}>`;
  }
  return "<unrecognized Authorization format>";
}

function parseProjectsPayload(json: unknown): Basecamp2Project[] {
  if (!Array.isArray(json)) {
    throw new Error("Basecamp returned unexpected JSON (expected an array of projects).");
  }

  const out: Basecamp2Project[] = [];
  for (const el of json) {
    if (!el || typeof el !== "object") continue;
    const o = el as Record<string, unknown>;
    const idRaw = o.id;
    const nameRaw = o.name;
    const id =
      typeof idRaw === "number" && Number.isFinite(idRaw)
        ? String(Math.trunc(idRaw))
        : typeof idRaw === "string" && idRaw.trim() !== ""
          ? idRaw.trim()
          : "";
    const name = typeof nameRaw === "string" ? nameRaw.trim() : "";
    if (!id || !name) continue;
    out.push({ id, name });
  }
  return out;
}

async function fetchBasecampPage(
  url: string,
  headers: Record<string, string>,
  options?: { log?: boolean },
): Promise<Response> {
  const log = options?.log !== false;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), BASECAMP_FETCH_TIMEOUT_MS);

  if (log) {
    const authHeader = headers.Authorization;
    console.log("BASECAMP AUTH HEADER:", redactAuthHeaderForLog(authHeader));
    console.log("BASECAMP URL:", url);
  }

  try {
    const res = await fetch(url, {
      method: "GET",
      headers,
      cache: "no-store",
      signal: controller.signal,
    });
    return res;
  } catch (e) {
    const name = e instanceof Error ? e.name : "";
    if (name === "AbortError" || (e instanceof DOMException && e.name === "AbortError")) {
      throw new Error("Basecamp API timed out.");
    }
    throw e;
  } finally {
    clearTimeout(timeoutId);
  }
}

function utcDayNumber(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** Positive = how many whole UTC days after `dueOn` (YYYY-MM-DD) until today. */
export function daysLateFromDueOn(dueOn: string | null | undefined): number {
  if (dueOn == null || String(dueOn).trim() === "") return 0;
  const raw = String(dueOn).trim().slice(0, 10);
  const due = new Date(`${raw}T12:00:00.000Z`);
  if (Number.isNaN(due.getTime())) return 0;
  const diff = utcDayNumber(new Date()) - utcDayNumber(due);
  return diff > 0 ? diff : 0;
}

function extractProjectIdFromTodo(todo: Record<string, unknown>): string | null {
  const project = todo.project as Record<string, unknown> | undefined;
  if (project && project.id != null) {
    return typeof project.id === "number" ? String(Math.trunc(project.id)) : String(project.id).trim();
  }
  const bucket = todo.bucket as Record<string, unknown> | undefined;
  if (bucket && bucket.id != null) {
    return typeof bucket.id === "number" ? String(Math.trunc(bucket.id)) : String(bucket.id).trim();
  }
  const url = String(todo.url ?? todo.app_url ?? "");
  const m = url.match(/\/(?:projects|buckets)\/(\d+)/);
  return m ? m[1] : null;
}

function extractProjectName(todo: Record<string, unknown>): string | undefined {
  const project = todo.project as Record<string, unknown> | undefined;
  const pn = project?.name;
  if (typeof pn === "string" && pn.trim()) return pn.trim();
  const bucket = todo.bucket as Record<string, unknown> | undefined;
  const bn = bucket?.name;
  if (typeof bn === "string" && bn.trim()) return bn.trim();
  return undefined;
}

function extractTodoTitle(todo: Record<string, unknown>): string {
  const content = todo.content;
  if (typeof content === "string" && content.trim()) return content.trim();
  const title = todo.title;
  if (typeof title === "string" && title.trim()) return title.trim();
  return "Overdue to-do";
}

function extractDueOn(todo: Record<string, unknown>): string | null {
  const dueOn = todo.due_on;
  if (typeof dueOn === "string" && dueOn.trim()) return dueOn.trim().slice(0, 10);
  const dueAt = todo.due_at;
  if (typeof dueAt === "string" && dueAt.trim()) {
    const d = new Date(dueAt);
    if (!Number.isNaN(d.getTime())) {
      return d.toISOString().slice(0, 10);
    }
  }
  return null;
}

function normalizeTodo(todo: unknown, group: OverdueTodoGroupKey): NormalizedOverdueTodo | null {
  if (!todo || typeof todo !== "object") return null;
  const o = todo as Record<string, unknown>;
  const projectId = extractProjectIdFromTodo(o);
  if (!projectId) return null;
  const dueOn = extractDueOn(o);
  const daysLate = daysLateFromDueOn(dueOn);
  const projectName = extractProjectName(o);
  return {
    projectId,
    title: extractTodoTitle(o),
    dueOn,
    daysLate,
    group,
    ...(projectName ? { projectName } : {}),
  };
}

function parseOverdueReportJson(json: unknown): OverdueTodosReport {
  const empty = (): OverdueTodosReport => ({
    under_a_week_late: [],
    over_a_week_late: [],
    over_a_month_late: [],
    over_three_months_late: [],
  });

  if (json == null || typeof json !== "object" || Array.isArray(json)) {
    throw new Error("Basecamp overdue report: expected a JSON object.");
  }

  const root = json as Record<string, unknown>;
  const out = empty();

  for (const key of OVERDUE_GROUP_KEYS) {
    const arr = root[key];
    if (!Array.isArray(arr)) continue;
    for (const el of arr) {
      const n = normalizeTodo(el, key);
      if (n) out[key].push(n);
    }
  }

  return out;
}

function assignGroupFromDaysLate(daysLate: number): OverdueTodoGroupKey {
  if (daysLate <= 7) return "under_a_week_late";
  if (daysLate <= 30) return "over_a_week_late";
  if (daysLate <= 90) return "over_a_month_late";
  return "over_three_months_late";
}

function bucketizeTodos(todos: NormalizedOverdueTodo[]): OverdueTodosReport {
  const out: OverdueTodosReport = {
    under_a_week_late: [],
    over_a_week_late: [],
    over_a_month_late: [],
    over_three_months_late: [],
  };
  for (const t of todos) {
    out[t.group].push(t);
  }
  return out;
}

function mergeTodoWithBucket(todo: unknown, listBucket: Record<string, unknown> | undefined): Record<string, unknown> {
  const t = (todo && typeof todo === "object" ? todo : {}) as Record<string, unknown>;
  return { ...t, ...(listBucket ? { bucket: listBucket } : {}) };
}

async function collectOverdueFromTodoArray(
  todos: unknown[],
  listBucket: Record<string, unknown> | undefined,
  options?: { skipCompleted?: boolean },
): Promise<NormalizedOverdueTodo[]> {
  const skipCompleted = options?.skipCompleted === true;
  const out: NormalizedOverdueTodo[] = [];
  for (const el of todos) {
    const merged = mergeTodoWithBucket(el, listBucket);
    if (skipCompleted && merged.completed === true) continue;
    const due = extractDueOn(merged);
    const daysLate = daysLateFromDueOn(due);
    if (daysLate <= 0) continue;
    const group = assignGroupFromDaysLate(daysLate);
    const n = normalizeTodo(merged, group);
    if (n) out.push(n);
  }
  return out;
}

const MAX_LIST_DETAIL_FETCHES = 40;
/** Per-project cap when expanding `projects/:id/todo_lists.json` into list details. */
const MAX_PROJECT_LIST_DETAIL_FETCHES = 80;

/**
 * Fetches all to-do lists for a Basecamp 2 project (same account segment as the project mapper).
 * @see https://github.com/basecamp/bcx-api/blob/master/sections/todo_lists.md
 */
export async function fetchProjectTodoLists(projectId: string): Promise<unknown[]> {
  const pid = String(projectId ?? "").trim();
  if (!pid) return [];

  const accountId = getBasecampAccountId();
  const url = `https://basecamp.com/${accountId}/api/v1/projects/${encodeURIComponent(pid)}/todo_lists.json`;
  const headers = buildAuthHeaders();
  const res = await fetchBasecampPage(url, headers, { log: false });

  if (!res.ok) {
    console.error(
      `[Basecamp project todo_lists] project=${pid} — HTTP`,
      res.status,
      res.statusText,
      res.url,
    );
    return [];
  }

  const json: unknown = await res.json();
  if (!Array.isArray(json)) {
    console.error(`[Basecamp project todo_lists] project=${pid} — expected JSON array`);
    return [];
  }
  return json;
}

const MAX_MESSAGE_EXCERPT_LENGTH = 600;

function stripHtmlToPlainText(html: string): string {
  const t = html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  if (t.length <= MAX_MESSAGE_EXCERPT_LENGTH) return t;
  return `${t.slice(0, MAX_MESSAGE_EXCERPT_LENGTH)}…`;
}

function topicUpdatedAtMs(topic: Record<string, unknown>): number {
  const raw = topic.updated_at;
  if (typeof raw !== "string" || !raw.trim()) return 0;
  const t = new Date(raw.trim()).getTime();
  return Number.isFinite(t) ? t : 0;
}

/**
 * Latest **message board** activity for a project: first page of `topics.json` (newest first),
 * filtered to `topicable.type === "Message"`, then the most recently updated thread.
 * @see https://github.com/basecamp/bcx-api/blob/master/sections/topics.md
 */
export async function fetchProjectLatestMessageBoardTopic(
  projectId: string,
): Promise<CommunicationLastMessageSnapshot | null> {
  const pid = String(projectId ?? "").trim();
  if (!pid) return null;

  const accountId = getBasecampAccountId();
  const url = `https://basecamp.com/${accountId}/api/v1/projects/${encodeURIComponent(pid)}/topics.json?page=1`;
  const headers = buildAuthHeaders();
  const res = await fetchBasecampPage(url, headers, { log: false });

  if (!res.ok) {
    console.error(
      `[Basecamp project topics] project=${pid} — HTTP`,
      res.status,
      res.statusText,
      res.url,
    );
    return null;
  }

  const json: unknown = await res.json();
  if (!Array.isArray(json)) {
    console.error(`[Basecamp project topics] project=${pid} — expected JSON array`);
    return null;
  }

  const messageTopics: Record<string, unknown>[] = [];
  for (const el of json) {
    if (!el || typeof el !== "object") continue;
    const row = el as Record<string, unknown>;
    const topicable = row.topicable;
    if (!topicable || typeof topicable !== "object") continue;
    const type = (topicable as Record<string, unknown>).type;
    if (String(type) !== "Message") continue;
    messageTopics.push(row);
  }

  if (messageTopics.length === 0) return null;

  messageTopics.sort((a, b) => topicUpdatedAtMs(b) - topicUpdatedAtMs(a));
  const top = messageTopics[0];
  const title = typeof top.title === "string" ? top.title.trim() : "";
  const excerptRaw = typeof top.excerpt === "string" ? top.excerpt.trim() : "";
  const updatedAt = typeof top.updated_at === "string" ? top.updated_at.trim() : "";
  if (!title || !updatedAt) return null;

  let authorName: string | undefined;
  let authorId: string | undefined;
  let authorEmail: string | undefined;
  const lastUpdater = top.last_updater;
  if (lastUpdater && typeof lastUpdater === "object") {
    const lu = lastUpdater as Record<string, unknown>;
    const n = lu.name;
    if (typeof n === "string" && n.trim()) authorName = n.trim();
    const idRaw = lu.id;
    if (typeof idRaw === "number" && Number.isFinite(idRaw)) authorId = String(Math.trunc(idRaw));
    else if (typeof idRaw === "string" && idRaw.trim()) authorId = idRaw.trim();
    const emailRaw = lu.email_address ?? lu.emailAddress;
    if (typeof emailRaw === "string" && emailRaw.trim()) authorEmail = emailRaw.trim();
  }

  const topicable = top.topicable as Record<string, unknown>;
  const appUrl = typeof topicable.app_url === "string" ? topicable.app_url.trim() : undefined;
  const excerpt = stripHtmlToPlainText(excerptRaw);

  return {
    subject: title,
    excerpt: excerpt || "(No preview text.)",
    updatedAt,
    ...(authorName ? { authorName } : {}),
    ...(authorId ? { authorId } : {}),
    ...(authorEmail ? { authorEmail } : {}),
    ...(appUrl ? { webUrl: appUrl } : {}),
  };
}

/**
 * Expands `projects/:id/todo_lists.json` payloads into overdue `NormalizedOverdueTodo[]`
 * (incomplete items with `due_on` / `due_at` before today). Fetches list `url` when needed.
 */
export async function collectOverdueTodosFromProjectTodoLists(
  projectId: string,
  listsJson: unknown[],
  projectDisplayName?: string,
): Promise<NormalizedOverdueTodo[]> {
  const pid = String(projectId ?? "").trim();
  if (!pid || listsJson.length === 0) return [];

  const headers = buildAuthHeaders();
  const fallbackBucket: Record<string, unknown> = {
    id: /^\d+$/.test(pid) ? Number(pid) : pid,
    ...(projectDisplayName?.trim() ? { name: projectDisplayName.trim() } : {}),
  };

  const collected: NormalizedOverdueTodo[] = [];
  let detailFetches = 0;

  for (const raw of listsJson) {
    if (!raw || typeof raw !== "object") continue;
    const list = raw as Record<string, unknown>;
    const listBucket =
      list.bucket && typeof list.bucket === "object"
        ? (list.bucket as Record<string, unknown>)
        : fallbackBucket;

    const assigned = list.assigned_todos;
    if (Array.isArray(assigned) && assigned.length > 0) {
      collected.push(...(await collectOverdueFromTodoArray(assigned, listBucket, { skipCompleted: true })));
      continue;
    }

    const todosRoot = list.todos;
    if (todosRoot && typeof todosRoot === "object") {
      const remaining = (todosRoot as Record<string, unknown>).remaining;
      if (Array.isArray(remaining) && remaining.length > 0) {
        collected.push(...(await collectOverdueFromTodoArray(remaining, listBucket, { skipCompleted: true })));
        continue;
      }
    }

    const remCount = Number(list.remaining_count);
    const listUrl = typeof list.url === "string" ? list.url.trim() : "";
    if (!listUrl || !Number.isFinite(remCount) || remCount <= 0) continue;
    if (detailFetches >= MAX_PROJECT_LIST_DETAIL_FETCHES) break;

    const res = await fetchBasecampPage(listUrl, headers, { log: false });
    detailFetches += 1;
    if (!res.ok) {
      console.error(`[Basecamp project todolist detail]`, res.status, res.statusText, listUrl);
      continue;
    }
    const detail = (await res.json()) as Record<string, unknown>;
    const bucket =
      (detail.bucket && typeof detail.bucket === "object"
        ? (detail.bucket as Record<string, unknown>)
        : undefined) ?? listBucket;
    const detailTodos = detail.todos;
    if (!detailTodos || typeof detailTodos !== "object") continue;
    const remaining = (detailTodos as Record<string, unknown>).remaining;
    if (!Array.isArray(remaining)) continue;
    collected.push(...(await collectOverdueFromTodoArray(remaining, bucket, { skipCompleted: true })));
  }

  return collected;
}

/**
 * Parses `people/me/todo_lists.json` or `people/me/assigned_todos.json` style arrays:
 * lists may include `assigned_todos`, or we fetch each list `url` for `todos.remaining` when needed.
 */
async function parsePersonalTodoListsOverdue(
  json: unknown,
  headers: Record<string, string>,
): Promise<OverdueTodosReport> {
  if (!Array.isArray(json)) {
    throw new Error("Basecamp personal todo lists: expected a JSON array.");
  }

  const collected: NormalizedOverdueTodo[] = [];
  let detailFetches = 0;

  for (const raw of json) {
    if (!raw || typeof raw !== "object") continue;
    const list = raw as Record<string, unknown>;
    const listBucket =
      list.bucket && typeof list.bucket === "object" ? (list.bucket as Record<string, unknown>) : undefined;

    const assigned = list.assigned_todos;
    if (Array.isArray(assigned) && assigned.length > 0) {
      collected.push(...(await collectOverdueFromTodoArray(assigned, listBucket, { skipCompleted: false })));
      continue;
    }

    const remCount = Number(list.remaining_count);
    const listUrl = typeof list.url === "string" ? list.url.trim() : "";
    if (!listUrl || !Number.isFinite(remCount) || remCount <= 0) continue;
    if (detailFetches >= MAX_LIST_DETAIL_FETCHES) break;

    const res = await fetchBasecampPage(listUrl, headers, { log: false });
    detailFetches += 1;
    if (!res.ok) {
      logOverdueHttpFailure(`todolist detail ${listUrl}`, res);
      continue;
    }
    const detail = (await res.json()) as Record<string, unknown>;
    const bucket =
      (detail.bucket && typeof detail.bucket === "object"
        ? (detail.bucket as Record<string, unknown>)
        : undefined) ?? listBucket;
    const todosRoot = detail.todos;
    if (!todosRoot || typeof todosRoot !== "object") continue;
    const remaining = (todosRoot as Record<string, unknown>).remaining;
    if (!Array.isArray(remaining)) continue;
    collected.push(...(await collectOverdueFromTodoArray(remaining, bucket, { skipCompleted: false })));
  }

  return bucketizeTodos(collected);
}

/**
 * Fetches overdue to-dos: fixed BC2 report URL, then personal `todo_lists` / `assigned_todos` fallbacks.
 * Uses **HTTP Basic only** (exact `Basic ` + base64(username:password)), `Accept: application/json`.
 */
export async function fetchOverdueTasksReport(): Promise<OverdueTodosReport> {
  const headers = buildBulletproofOverdueHeaders();

  const primary = await fetchBasecampPage(BC_OVERDUE_REPORT_URL, headers, { log: true });
  if (primary.ok) {
    return parseOverdueReportJson(await primary.json());
  }
  logOverdueHttpFailure("global overdue report", primary);
  if (primary.status !== 404) {
    const text = await primary.text();
    throw new Error(`Basecamp overdue report ${primary.status}: ${text.slice(0, 400)}`);
  }

  const listsTry = await fetchBasecampPage(BC_PERSONAL_TODO_LISTS_URL, headers, { log: false });
  if (listsTry.ok) {
    return parsePersonalTodoListsOverdue(await listsTry.json(), headers);
  }
  logOverdueHttpFailure("people/me/todo_lists.json fallback", listsTry);

  const assignedTry = await fetchBasecampPage(BC_PERSONAL_ASSIGNED_TODOS_URL, headers, { log: false });
  if (assignedTry.ok) {
    return parsePersonalTodoListsOverdue(await assignedTry.json(), headers);
  }
  logOverdueHttpFailure("people/me/assigned_todos.json fallback", assignedTry);
  const text = await assignedTry.text();
  throw new Error(
    `Basecamp overdue: report 404, todo_lists ${listsTry.status}, assigned_todos ${assignedTry.status}: ${text.slice(0, 300)}`,
  );
}

/**
 * Lists projects from Basecamp 2 API v1 — **page 1 only** (debug / simplify).
 * @see https://github.com/basecamp/bcx-api/blob/master/sections/projects.md
 */
export async function listAllBasecampProjects(): Promise<Basecamp2Project[]> {
  const accountId = getBasecampAccountId();
  const headers = buildAuthHeaders();
  const url = `https://basecamp.com/${accountId}/api/v1/projects.json?page=1`;

  const res = await fetchBasecampPage(url, headers);

  if (!res.ok) {
    const text = await res.text();
    const snippet = text.slice(0, 400);
    if (res.status === 401) {
      const usingBearer = Boolean(normalizeEnvSecret(process.env.BASECAMP_ACCESS_TOKEN));
      const hint = usingBearer
        ? "Bearer token was rejected — generate a fresh token or confirm it includes this Basecamp 2 account."
        : [
            "HTTP Basic was rejected. Try, in order:",
            "(1) Set BASECAMP_BASIC_USER to the exact Basecamp **sign-in username** if it is not your email (see basecamp.com → Me → My profile).",
            "(2) If you use 2FA, use a Basecamp/37signals **app password** (or an access token: set BASECAMP_ACCESS_TOKEN and leave password unset).",
            "(3) Confirm BASECAMP_ACCOUNT_ID is the same numeric account id as in the browser URL when you open this Basecamp account.",
            "(4) Remove stray quotes/spaces around values in .env.local.",
          ].join(" ");
      throw new Error(`Basecamp 401: ${snippet || "Access denied."} ${hint}`);
    }
    throw new Error(`Basecamp ${res.status}: ${snippet}`);
  }

  const json: unknown = await res.json();
  const batch = parseProjectsPayload(json);
  return batch.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}
