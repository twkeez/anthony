"use client";

import { ChevronDown, ChevronRight, ExternalLink, Loader2, MessageCircle, RefreshCw, UserCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";

import {
  COMMUNICATION_MESSAGE_BOARD_ROLLING_DAYS,
  daysSinceLastContactFromIso,
  nextStepsForMessageBoardPost,
  summarizeMessageBoardPost,
  type CommunicationMessageBoardActivityItem,
  type MessageBoardAuthorSide,
} from "@/lib/agency-hub/communication-alerts";
import { COMMUNICATION_WAITING_ON_CLIENT_TRIAGE_KEY } from "@/lib/communication/message-board-triage-types";
import type { CommunicationMessageBoardTriageRow } from "@/lib/communication/message-board-triage-types";
import { isMessageBoardThreadHiddenByTriage } from "@/lib/communication/message-board-triage-filter";
import { messageBoardThreadKey } from "@/lib/communication/message-board-thread-key";
import { CommunicationGbpReviews } from "@/components/agencypulse/communication-gbp-reviews";
import {
  communicationHealthSortRank,
  communicationRowHealth,
  lastBoardActivityMs,
  type CommunicationCommandCenterRow,
  type CommunicationHealth,
} from "@/lib/data/communication-command-center";
import { useDashboardSync } from "@/lib/context/dashboard-sync-context";
import { Button, buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

const glass = "rounded-xl border border-zinc-800 bg-zinc-900/90 shadow-sm";

function StatusDot({ status }: { status: CommunicationHealth }) {
  const cls =
    status === "red"
      ? "bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.45)]"
      : status === "yellow"
        ? "bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.35)]"
        : status === "green"
          ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.35)]"
          : "bg-zinc-600";
  return (
    <span className="flex items-center justify-center" title={status}>
      <span className={cn("size-3 shrink-0 rounded-full", cls)} aria-hidden />
    </span>
  );
}

function contactDays(row: CommunicationCommandCenterRow): number | null {
  const c = row.communication;
  if (!c) return null;
  if (c.daysSinceLastContact != null && Number.isFinite(c.daysSinceLastContact)) {
    return Math.round(c.daysSinceLastContact);
  }
  if (c.lastMessage?.updatedAt) {
    return daysSinceLastContactFromIso(c.lastMessage.updatedAt);
  }
  return null;
}

function lastContactLabel(row: CommunicationCommandCenterRow): string {
  const d = contactDays(row);
  if (d == null) return "—";
  if (d === 0) return "Today";
  if (d === 1) return "1 day ago";
  return `${d} days ago`;
}

function lastContactBy(row: CommunicationCommandCenterRow): string {
  const c = row.communication;
  if (!c) return "—";
  const name = (c.lastMessageAuthor ?? c.lastMessage?.authorName ?? "").trim();
  if (name) return name;
  const id = c.lastMessage?.authorId?.trim();
  return id ? `Person ${id}` : "—";
}

function boardAuthorSidePillClass(side: MessageBoardAuthorSide): string {
  if (side === "internal") return "border-violet-500/40 bg-violet-950/40 text-violet-200";
  if (side === "external") return "border-sky-500/35 bg-sky-950/35 text-sky-200";
  return "border-zinc-600 bg-zinc-900 text-zinc-400";
}

function boardAuthorSideLabel(side: MessageBoardAuthorSide): string {
  if (side === "internal") return "Agency";
  if (side === "external") return "Client";
  return "Unknown";
}

function filterVisibleActivity(
  clientId: string,
  items: CommunicationMessageBoardActivityItem[],
  triage: CommunicationMessageBoardTriageRow[],
  daysSinceLastContact: number | null,
): CommunicationMessageBoardActivityItem[] {
  return items.filter(
    (it) => !isMessageBoardThreadHiddenByTriage(clientId, it, triage, daysSinceLastContact, Date.now()),
  );
}

function inferAuthorSideFromComm(
  comm: CommunicationCommandCenterRow["communication"],
): MessageBoardAuthorSide {
  if (comm?.is_internal_author === true) return "internal";
  if (comm?.is_internal_author === false) return "external";
  return "unknown";
}

/** When `messageBoardActivity` is empty (older sync), build one preview row from `lastMessage`. */
function latestItemFromLastMessageOnly(
  comm: CommunicationCommandCenterRow["communication"],
): CommunicationMessageBoardActivityItem | null {
  const lm = comm?.lastMessage;
  if (!lm?.updatedAt || !lm.subject?.trim()) return null;
  const authorSide = inferAuthorSideFromComm(comm);
  return {
    ...lm,
    authorSide,
    summary: summarizeMessageBoardPost(lm, authorSide),
    nextSteps: nextStepsForMessageBoardPost(authorSide, lm.subject, lm.excerpt),
  };
}

async function postTriageRequest(
  clientId: string,
  item: CommunicationMessageBoardActivityItem,
  action: "dismiss" | "snooze",
  snoozeDays?: number,
): Promise<void> {
  const res = await fetch("/api/communication-message-board-triage", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      thread_key: messageBoardThreadKey(item),
      thread_updated_at: item.updatedAt.trim(),
      action,
      ...(action === "snooze" ? { snooze_days: snoozeDays ?? 3 } : {}),
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Save failed");
}

function LastPostSourceBadge({ comm }: { comm: CommunicationCommandCenterRow["communication"] }) {
  if (comm?.is_internal_author === true) {
    return (
      <span className="inline-flex rounded-md border border-violet-500/40 bg-violet-950/40 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-violet-200">
        Agency
      </span>
    );
  }
  if (comm?.is_internal_author === false) {
    return (
      <span className="inline-flex rounded-md border border-sky-500/35 bg-sky-950/35 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-sky-200">
        Client
      </span>
    );
  }
  return (
    <span className="text-zinc-500 text-[10px] font-medium uppercase tracking-wide" title="Configure Team / Internal contacts">
      Unknown
    </span>
  );
}

type BoardProps = {
  clientId: string;
  items: CommunicationMessageBoardActivityItem[];
  triage: CommunicationMessageBoardTriageRow[];
  daysSinceLastContact: number | null;
  onTriageDone: () => void;
};

type LatestPreviewProps = {
  clientId: string;
  item: CommunicationMessageBoardActivityItem;
  onTriageDone: () => void;
};

function LatestMessagePreview({ clientId, item, onTriageDone }: LatestPreviewProps) {
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const k = messageBoardThreadKey(item);

  const run = useCallback(
    async (action: "dismiss" | "snooze", snoozeDays?: number) => {
      setBusyKey(k);
      try {
        await postTriageRequest(clientId, item, action, snoozeDays);
        toast.success(action === "dismiss" ? "Dismissed for this thread until new activity." : "Snoozed.");
        onTriageDone();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Request failed.");
      } finally {
        setBusyKey(null);
      }
    },
    [clientId, item, k, onTriageDone],
  );

  const busy = busyKey === k;

  return (
    <div className="px-4 py-4 sm:px-5">
      <p className="text-zinc-500 mb-3 text-[10px] font-semibold uppercase tracking-wide">Latest message</p>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400">
            <span className="font-mono tabular-nums">{item.updatedAt.slice(0, 10)}</span>
            <span
              className={cn(
                "inline-flex rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                boardAuthorSidePillClass(item.authorSide),
              )}
            >
              {boardAuthorSideLabel(item.authorSide)}
            </span>
            {item.authorName ? <span className="text-zinc-400">{item.authorName}</span> : null}
          </div>
          <p className="text-sm font-medium leading-snug text-zinc-100">{item.subject}</p>
          <p className="text-zinc-500 line-clamp-4 text-xs leading-relaxed whitespace-pre-wrap">{item.excerpt}</p>
          <p className="text-zinc-400 line-clamp-2 text-xs leading-snug">{item.summary}</p>
          <p className="text-zinc-500 line-clamp-2 text-xs leading-snug">{item.nextSteps}</p>
        </div>
        <div className="flex shrink-0 flex-col gap-2 sm:items-end">
          <div className="flex flex-wrap gap-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              className="h-7 border-zinc-600 px-2 text-[11px]"
              onClick={() => void run("dismiss")}
            >
              Dismiss
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              className="h-7 border-zinc-600 px-2 text-[11px]"
              onClick={() => void run("snooze", 1)}
            >
              1d
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              className="h-7 border-zinc-600 px-2 text-[11px]"
              onClick={() => void run("snooze", 3)}
            >
              3d
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              className="h-7 border-zinc-600 px-2 text-[11px]"
              onClick={() => void run("snooze", 7)}
            >
              7d
            </Button>
          </div>
          {item.webUrl ? (
            <a
              href={item.webUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-sky-400 hover:text-sky-300"
            >
              Open in Basecamp
              <ExternalLink className="size-3 opacity-80" aria-hidden />
            </a>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function BoardActivityTable({ clientId, items, triage, daysSinceLastContact, onTriageDone }: BoardProps) {
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const visible = useMemo(
    () => filterVisibleActivity(clientId, items, triage, daysSinceLastContact),
    [clientId, items, triage, daysSinceLastContact],
  );

  const postTriage = useCallback(
    async (item: CommunicationMessageBoardActivityItem, action: "dismiss" | "snooze", snoozeDays?: number) => {
      const key = messageBoardThreadKey(item);
      setBusyKey(key);
      try {
        await postTriageRequest(clientId, item, action, snoozeDays);
        toast.success(action === "dismiss" ? "Dismissed for this thread until new activity." : "Snoozed.");
        onTriageDone();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Request failed.");
      } finally {
        setBusyKey(null);
      }
    },
    [clientId, onTriageDone],
  );

  return (
    <div className="px-3 py-4 sm:px-4">
      <p className="text-zinc-500 mb-3 text-[11px] font-semibold uppercase tracking-wide">
        All threads — last {COMMUNICATION_MESSAGE_BOARD_ROLLING_DAYS} days · newest first. Rule-based summary / next
        steps (not an LLM). Dismiss/snooze: hidden until new activity on that thread, or after snooze per your triage
        rules.
      </p>
      {visible.length === 0 ? (
        <p className="text-zinc-500 py-6 text-center text-sm">No visible threads (all snoozed/dismissed or none in window).</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-zinc-800/80">
          <Table>
            <TableHeader>
              <TableRow className="border-zinc-800 hover:bg-zinc-900/80">
                <TableHead className="whitespace-nowrap text-zinc-500">When</TableHead>
                <TableHead className="text-zinc-500">From</TableHead>
                <TableHead className="min-w-[140px] text-zinc-500">Subject</TableHead>
                <TableHead className="min-w-[220px] text-zinc-500">Message</TableHead>
                <TableHead className="min-w-[160px] text-zinc-500">Summary</TableHead>
                <TableHead className="min-w-[160px] text-zinc-500">Next steps</TableHead>
                <TableHead className="min-w-[200px] text-zinc-500">Triage</TableHead>
                <TableHead className="w-24 text-zinc-500"> </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((it) => {
                const k = messageBoardThreadKey(it);
                const busy = busyKey === k;
                return (
                  <TableRow key={`${it.updatedAt}-${k}`} className="border-zinc-800 hover:bg-zinc-900/40">
                    <TableCell className="whitespace-nowrap align-top text-xs text-zinc-400">
                      {it.updatedAt.slice(0, 10)}
                    </TableCell>
                    <TableCell className="align-top">
                      <span
                        className={cn(
                          "inline-flex rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                          boardAuthorSidePillClass(it.authorSide),
                        )}
                      >
                        {boardAuthorSideLabel(it.authorSide)}
                      </span>
                      {it.authorName ? (
                        <p className="text-zinc-500 mt-1 max-w-[140px] text-[11px] leading-snug">{it.authorName}</p>
                      ) : null}
                    </TableCell>
                    <TableCell className="align-top text-sm font-medium text-zinc-200">{it.subject}</TableCell>
                    <TableCell className="max-w-[min(40vw,18rem)] align-top">
                      <div className="text-zinc-500 max-h-36 overflow-y-auto text-xs leading-relaxed whitespace-pre-wrap">
                        {it.excerpt}
                      </div>
                    </TableCell>
                    <TableCell className="max-w-[min(40vw,15rem)] align-top text-xs leading-snug text-zinc-300">
                      {it.summary}
                    </TableCell>
                    <TableCell className="max-w-[min(40vw,15rem)] align-top text-xs leading-snug text-zinc-400">
                      {it.nextSteps}
                    </TableCell>
                    <TableCell className="align-top">
                      <div className="flex flex-wrap gap-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={busy}
                          className="h-7 border-zinc-600 px-2 text-[11px]"
                          onClick={() => void postTriage(it, "dismiss")}
                        >
                          Dismiss
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={busy}
                          className="h-7 border-zinc-600 px-2 text-[11px]"
                          onClick={() => void postTriage(it, "snooze", 1)}
                        >
                          1d
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={busy}
                          className="h-7 border-zinc-600 px-2 text-[11px]"
                          onClick={() => void postTriage(it, "snooze", 3)}
                        >
                          3d
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={busy}
                          className="h-7 border-zinc-600 px-2 text-[11px]"
                          onClick={() => void postTriage(it, "snooze", 7)}
                        >
                          7d
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell className="text-right align-top">
                      {it.webUrl ? (
                        <a
                          href={it.webUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-sky-400 hover:text-sky-300"
                        >
                          Open
                          <ExternalLink className="size-3 opacity-80" aria-hidden />
                        </a>
                      ) : null}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

type Props = {
  initialRows: CommunicationCommandCenterRow[];
  initialTriage: CommunicationMessageBoardTriageRow[];
};

export function CommunicationCommandCenter({ initialRows, initialTriage }: Props) {
  const router = useRouter();
  const { runScopedSync, isSyncing } = useDashboardSync();
  const [expandedClientIds, setExpandedClientIds] = useState<Set<string>>(() => new Set());

  const toggleCardExpanded = useCallback((clientId: string) => {
    setExpandedClientIds((prev) => {
      const next = new Set(prev);
      if (next.has(clientId)) next.delete(clientId);
      else next.add(clientId);
      return next;
    });
  }, []);

  const sortedRows = useMemo(() => {
    const out = [...initialRows];
    out.sort((a, b) => {
      const ha = communicationRowHealth(
        a.communication,
        a.hasBasecampProject,
        a.client.id,
        initialTriage,
        a.gbpNeedsUrgentReply,
      );
      const hb = communicationRowHealth(
        b.communication,
        b.hasBasecampProject,
        b.client.id,
        initialTriage,
        b.gbpNeedsUrgentReply,
      );
      const ra = communicationHealthSortRank(ha);
      const rb = communicationHealthSortRank(hb);
      if (ra !== rb) return ra - rb;
      return lastBoardActivityMs(b.communication) - lastBoardActivityMs(a.communication);
    });
    return out;
  }, [initialRows, initialTriage]);

  const onTriageDone = useCallback(() => {
    router.refresh();
  }, [router]);

  const dismissWaitingForClient = useCallback(
    async (row: CommunicationCommandCenterRow) => {
      const lu = row.communication?.lastMessage?.updatedAt?.trim();
      if (!lu) {
        toast.error("No last message to dismiss.");
        return;
      }
      try {
        const res = await fetch("/api/communication-message-board-triage", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            client_id: row.client.id,
            thread_key: COMMUNICATION_WAITING_ON_CLIENT_TRIAGE_KEY,
            thread_updated_at: lu,
            action: "dismiss",
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Save failed");
        toast.success("Marked as no reply needed for this last message until it changes.");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Request failed.");
      }
    },
    [router],
  );

  const runSyncCommunication = useCallback(async () => {
    const res = await runScopedSync("communication");
    if (!res.ok) return;
    router.refresh();
  }, [router, runScopedSync]);

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-6 px-4 py-8 sm:px-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-zinc-50">
            <MessageCircle className="size-7 text-violet-400/90" aria-hidden />
            Basecamp · Communication
          </h1>
          <p className="text-zinc-500 mt-1 max-w-2xl text-sm">
            Each card shows the header and latest board message; expand to see the full{" "}
            <span className="font-medium text-zinc-400">{COMMUNICATION_MESSAGE_BOARD_ROLLING_DAYS}-day</span> thread
            table. Cards are sorted with{" "}
            <span className="text-red-400/90">red</span> (client last on Basecamp, likely waiting, or a 1–3★ Google
            review without a reply) first, then{" "}
            <span className="text-amber-300/90">yellow</span>, then{" "}
            <span className="text-emerald-300/90">green</span> (agency last within 14 days).{" "}
            <span className="font-medium text-zinc-400">Yellow</span> is also used when anything does not match red or
            green. Run <span className="font-medium text-zinc-400">communication sync</span> to refresh. Data:{" "}
            <code className="rounded bg-zinc-800 px-1 font-mono text-[11px] text-zinc-300">client_metrics.communication_alerts</code>
            ; triage: <code className="rounded bg-zinc-800 px-1 font-mono text-[11px] text-zinc-300">communication_message_board_triage</code>.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Link
            href="/dashboard/gbp-reviews"
            className={cn(
              buttonVariants({ variant: "outline", size: "default" }),
              "inline-flex border-zinc-700 text-zinc-200",
            )}
          >
            GBP reviews
          </Link>
          <Link
            href="/dashboard/settings/communication-internal"
            className={cn(
              buttonVariants({ variant: "outline", size: "default" }),
              "inline-flex border-zinc-700 text-zinc-200",
            )}
          >
            <UserCheck className="mr-2 size-4 shrink-0" aria-hidden />
            Internal contacts
          </Link>
          <Button
            type="button"
            variant="default"
            disabled={isSyncing}
            onClick={() => void runSyncCommunication()}
            className="bg-gradient-to-r from-violet-600 to-sky-600 text-white hover:opacity-95 disabled:opacity-60"
          >
            {isSyncing ? (
              <>
                <Loader2 className="mr-2 size-4 shrink-0 animate-spin" aria-hidden />
                Syncing…
              </>
            ) : (
              <>
                <RefreshCw className="mr-2 size-4 shrink-0" aria-hidden />
                Sync Basecamp
              </>
            )}
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-5">
        {sortedRows.length === 0 ? (
          <div className={cn(glass, "p-10 text-center text-sm text-zinc-500")}>No clients yet.</div>
        ) : (
          sortedRows.map((row) => {
            const health = communicationRowHealth(
              row.communication,
              row.hasBasecampProject,
              row.client.id,
              initialTriage,
              row.gbpNeedsUrgentReply,
            );
            const comm = row.communication;
            const activity = comm?.messageBoardActivity ?? [];
            const days = contactDays(row);
            const overdue = comm?.overdueCount ?? 0;
            const lm = comm?.lastMessage;
            const visible = row.hasBasecampProject
              ? filterVisibleActivity(row.client.id, activity, initialTriage, days)
              : [];
            const latestItem = visible[0] ?? (row.hasBasecampProject ? latestItemFromLastMessageOnly(comm) : null);
            const expanded = expandedClientIds.has(row.client.id);
            const canExpand = row.hasBasecampProject && (activity.length > 0 || latestItem != null);
            const showGbpColumn =
              Boolean((row.client.gbp_location_id ?? "").trim()) || row.gbpReviews.length > 0;

            return (
              <div key={row.client.id} className={cn("overflow-hidden", glass)}>
                <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                  <div className="flex flex-wrap items-center gap-3">
                    <StatusDot status={health} />
                    <div>
                      <Link
                        href={`/dashboard/clients/${row.client.id}`}
                        className="text-lg font-semibold text-sky-400/90 hover:text-sky-300 hover:underline"
                      >
                        {row.client.business_name}
                      </Link>
                      {!row.hasBasecampProject ? (
                        <p className="text-zinc-600 mt-0.5 text-[11px]">No Basecamp project id</p>
                      ) : (
                        <p className="text-zinc-500 mt-1 text-xs">
                          Last contact {lastContactLabel(row)} · {lastContactBy(row)}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-zinc-500 text-[10px] font-medium uppercase tracking-wide">Last post</span>
                      <LastPostSourceBadge comm={comm} />
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {canExpand ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="border-zinc-600 text-[11px] text-zinc-200"
                        onClick={() => toggleCardExpanded(row.client.id)}
                      >
                        {expanded ? (
                          <>
                            <ChevronDown className="mr-1.5 size-3.5 rotate-180" aria-hidden />
                            Hide full history
                          </>
                        ) : (
                          <>
                            <ChevronRight className="mr-1.5 size-3.5" aria-hidden />
                            {visible.length > 1
                              ? `Show all threads (${visible.length})`
                              : activity.length > 0
                                ? "Show full table"
                                : "Show details"}
                          </>
                        )}
                      </Button>
                    ) : null}
                    {row.hasBasecampProject && health === "red" ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="border-zinc-600 text-[11px] text-zinc-200"
                        onClick={() => void dismissWaitingForClient(row)}
                      >
                        No reply needed
                      </Button>
                    ) : null}
                    <span className="text-zinc-500 text-xs">
                      Overdue tasks:{" "}
                      <span
                        className={cn(
                          "font-mono",
                          overdue > 0 ? (comm?.status === "red" ? "text-red-400" : "text-amber-400") : "text-zinc-600",
                        )}
                      >
                        {overdue}
                      </span>
                    </span>
                    {lm?.webUrl ? (
                      <a
                        href={lm.webUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-sky-400 hover:text-sky-300"
                      >
                        Latest in Basecamp
                        <ExternalLink className="size-3 opacity-80" aria-hidden />
                      </a>
                    ) : null}
                  </div>
                </div>
                <div
                  className={cn(
                    "border-t border-zinc-800/80 flex flex-col",
                    showGbpColumn && "lg:flex-row lg:divide-x lg:divide-zinc-800/80",
                  )}
                >
                  <div className="min-w-0 flex-1">
                    {row.hasBasecampProject && latestItem ? (
                      <LatestMessagePreview
                        clientId={row.client.id}
                        item={latestItem}
                        onTriageDone={onTriageDone}
                      />
                    ) : !row.hasBasecampProject ? (
                      <p className="text-zinc-500 px-4 py-6 text-sm sm:px-5">
                        Map a Basecamp project on the client to see threads here.
                      </p>
                    ) : (
                      <p className="text-zinc-500 px-4 py-6 text-sm sm:px-5">
                        No message-board activity in the rolling window yet — run a communication sync.
                      </p>
                    )}
                  </div>
                  {showGbpColumn ? (
                    <div className="min-w-0 flex-1 lg:max-w-[50%]">
                      <CommunicationGbpReviews
                        clientId={row.client.id}
                        businessName={row.client.business_name}
                        reviews={row.gbpReviews}
                        hasGbpLocation={Boolean((row.client.gbp_location_id ?? "").trim())}
                      />
                    </div>
                  ) : null}
                </div>
                {expanded && row.hasBasecampProject && activity.length > 0 ? (
                  <BoardActivityTable
                    clientId={row.client.id}
                    items={activity}
                    triage={initialTriage}
                    daysSinceLastContact={days}
                    onTriageDone={onTriageDone}
                  />
                ) : expanded && row.hasBasecampProject && activity.length === 0 ? (
                  <p className="text-zinc-500 border-t border-zinc-800/80 px-4 py-4 text-sm sm:px-5">
                    No thread rows in sync payload for this window (only the summary above may be available until the
                    next communication sync writes <span className="font-mono text-xs">messageBoardActivity</span>).
                  </p>
                ) : null}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
