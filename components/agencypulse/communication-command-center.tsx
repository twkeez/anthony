"use client";

import { ExternalLink, Loader2, MessageCircle, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";

import { daysSinceLastContactFromIso } from "@/lib/agency-hub/communication-alerts";
import {
  communicationHealthSortRank,
  communicationRowHealth,
  type CommunicationCommandCenterRow,
  type CommunicationHealth,
} from "@/lib/data/communication-command-center";
import { useDashboardSync } from "@/lib/context/dashboard-sync-context";
import { Button } from "@/components/ui/button";
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

function truncate(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

type SortKey = "status" | "name" | "contact";

export function CommunicationCommandCenter({ initialRows }: { initialRows: CommunicationCommandCenterRow[] }) {
  const router = useRouter();
  const { runScopedSync, isSyncing } = useDashboardSync();
  const [sortKey, setSortKey] = useState<SortKey>("status");
  const [sortAsc, setSortAsc] = useState(true);

  const runSyncCommunication = useCallback(async () => {
    const res = await runScopedSync("communication");
    if (!res.ok) return;
    router.refresh();
  }, [router, runScopedSync]);

  const sortedRows = useMemo(() => {
    const rows = [...initialRows];
    rows.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "status") {
        cmp =
          communicationHealthSortRank(communicationRowHealth(a.communication, a.hasBasecampProject)) -
          communicationHealthSortRank(communicationRowHealth(b.communication, b.hasBasecampProject));
      } else if (sortKey === "name") {
        cmp = a.client.business_name.localeCompare(b.client.business_name);
      } else {
        const ad = contactDays(a);
        const bd = contactDays(b);
        const av = ad ?? 9999;
        const bv = bd ?? 9999;
        cmp = av - bv;
      }
      return sortAsc ? cmp : -cmp;
    });
    return rows;
  }, [initialRows, sortKey, sortAsc]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc((v) => !v);
    else {
      setSortKey(key);
      setSortAsc(key === "status");
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-zinc-50">
            <MessageCircle className="size-7 text-violet-400/90" aria-hidden />
            Basecamp · Communication
          </h1>
          <p className="text-zinc-500 mt-1 max-w-2xl text-sm">
            Last message board activity, contact recency, and overdue to-dos from the mapped Basecamp project. Data
            lives on the current month&apos;s{" "}
            <code className="rounded bg-zinc-800 px-1 font-mono text-[11px] text-zinc-300">client_metrics.communication_alerts</code>{" "}
            row. Run a{" "}
            <span className="font-medium text-zinc-400">communication sync</span> (or full metrics sync) to refresh.
            <span className="text-zinc-600"> Red</span> = needs reply, stale 15+ days, or severe overdue tasks.{" "}
            <span className="text-zinc-600">Yellow</span> = moderate overdue or 7–14 days since last board activity.{" "}
            <span className="text-zinc-600">Green</span> = looks healthy.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
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

      <div className={cn("overflow-hidden", glass)}>
        <Table>
          <TableHeader>
            <TableRow className="border-zinc-800 hover:bg-transparent">
              <TableHead className="w-14 text-zinc-500">
                <button
                  type="button"
                  className="font-medium uppercase tracking-wide hover:text-zinc-300"
                  onClick={() => toggleSort("status")}
                >
                  Status{sortKey === "status" ? (sortAsc ? " ↑" : " ↓") : ""}
                </button>
              </TableHead>
              <TableHead className="text-zinc-500">
                <button
                  type="button"
                  className="font-medium uppercase tracking-wide hover:text-zinc-300"
                  onClick={() => toggleSort("name")}
                >
                  Client{sortKey === "name" ? (sortAsc ? " ↑" : " ↓") : ""}
                </button>
              </TableHead>
              <TableHead className="whitespace-nowrap text-zinc-500">
                <button
                  type="button"
                  className="font-medium uppercase tracking-wide hover:text-zinc-300"
                  onClick={() => toggleSort("contact")}
                >
                  Last contact{sortKey === "contact" ? (sortAsc ? " ↑" : " ↓") : ""}
                </button>
              </TableHead>
              <TableHead className="min-w-[120px] text-zinc-500">Last contact by</TableHead>
              <TableHead className="min-w-[220px] text-zinc-500">Latest message</TableHead>
              <TableHead className="w-24 text-right text-zinc-500">Overdue</TableHead>
              <TableHead className="w-24 text-zinc-500"> </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedRows.length === 0 ? (
              <TableRow className="border-zinc-800 hover:bg-zinc-950/40">
                <TableCell colSpan={7} className="text-zinc-500 py-10 text-center text-sm">
                  No clients yet.
                </TableCell>
              </TableRow>
            ) : (
              sortedRows.map((row) => {
                const health = communicationRowHealth(row.communication, row.hasBasecampProject);
                const comm = row.communication;
                const lm = comm?.lastMessage;
                const subject = lm?.subject?.trim() ?? "";
                const excerpt = lm?.excerpt?.trim() ?? "";
                const overdue = comm?.overdueCount ?? 0;

                return (
                  <TableRow key={row.client.id} className="border-zinc-800 hover:bg-zinc-950/50">
                    <TableCell>
                      <StatusDot status={health} />
                    </TableCell>
                    <TableCell className="font-medium">
                      <Link
                        href={`/dashboard/clients/${row.client.id}`}
                        className="text-sky-400/90 hover:text-sky-300 hover:underline"
                      >
                        {row.client.business_name}
                      </Link>
                      {!row.hasBasecampProject ? (
                        <span className="text-zinc-600 mt-0.5 block text-[11px] font-normal">No Basecamp project id</span>
                      ) : null}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm text-zinc-300">{lastContactLabel(row)}</TableCell>
                    <TableCell className="max-w-[160px] text-sm text-zinc-300">
                      <span className="line-clamp-2">{lastContactBy(row)}</span>
                      {comm?.is_internal_author === true ? (
                        <span className="text-violet-400/90 mt-0.5 block text-[10px] font-semibold uppercase tracking-wide">
                          Agency
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="max-w-[min(100vw,28rem)] text-sm">
                      {subject || excerpt ? (
                        <div className="space-y-1">
                          {subject ? (
                            <p className="text-zinc-200 line-clamp-2 font-medium leading-snug">{subject}</p>
                          ) : null}
                          {excerpt ? (
                            <p className="text-zinc-500 line-clamp-3 text-xs leading-relaxed">{truncate(excerpt, 220)}</p>
                          ) : null}
                          {comm?.waitingForResponse === true ? (
                            <p className="text-red-400/90 text-[11px] font-medium">Needs reply</p>
                          ) : null}
                        </div>
                      ) : (
                        <span className="text-zinc-600">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {row.hasBasecampProject ? (
                        <span
                          className={cn(
                            "font-mono text-xs",
                            overdue > 0 ? (comm?.status === "red" ? "text-red-400" : "text-amber-400") : "text-zinc-500",
                          )}
                        >
                          {overdue}
                        </span>
                      ) : (
                        <span className="text-zinc-600">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {lm?.webUrl ? (
                        <a
                          href={lm.webUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-sky-400 hover:text-sky-300"
                        >
                          Basecamp
                          <ExternalLink className="size-3 opacity-80" aria-hidden />
                        </a>
                      ) : (
                        <span className="text-zinc-600"> </span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
