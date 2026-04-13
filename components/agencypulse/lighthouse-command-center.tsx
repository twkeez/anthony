"use client";

import { Loader2, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";

import { useDashboardSync } from "@/lib/context/dashboard-sync-context";
import {
  lighthouseHealthSortRank,
  lighthouseRowHealth,
  type LighthouseCommandCenterRow,
} from "@/lib/data/lighthouse-command-center";
import { normalizeWebsiteForPageSpeed } from "@/lib/google/pagespeed-lighthouse";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

const glass = "rounded-xl border border-zinc-800 bg-zinc-900/90 shadow-sm";

function formatScore(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  return String(Math.round(Number(n)));
}

function StatusDot({ status }: { status: ReturnType<typeof lighthouseRowHealth> }) {
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

type SortKey = "status" | "name" | "performance" | "synced";

export function LighthouseCommandCenter({
  initialRows,
  minPerformanceScore,
}: {
  initialRows: LighthouseCommandCenterRow[];
  minPerformanceScore: number;
}) {
  const router = useRouter();
  const [sortKey, setSortKey] = useState<SortKey>("status");
  const [sortAsc, setSortAsc] = useState(true);
  const { runScopedSync, isSyncing } = useDashboardSync();

  const runSyncMetrics = useCallback(async () => {
    const res = await runScopedSync("lighthouse");
    if (!res.ok) return;
    const data = (await res.json()) as {
      message?: string;
      ok?: boolean;
      succeeded?: number;
      total?: number;
    };
    const msg = data.message ?? "Sync finished.";
    if (data.ok !== false) {
      toast.success(msg);
      router.refresh();
    } else {
      toast.error(msg);
    }
  }, [router, runScopedSync]);

  const sortedRows = useMemo(() => {
    const rows = [...initialRows];
    const health = (r: LighthouseCommandCenterRow) => lighthouseRowHealth(r, minPerformanceScore);

    rows.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "status") {
        cmp = lighthouseHealthSortRank(health(a)) - lighthouseHealthSortRank(health(b));
      } else if (sortKey === "name") {
        cmp = a.client.business_name.localeCompare(b.client.business_name);
      } else if (sortKey === "performance") {
        const av = a.performance != null ? Number(a.performance) : -Infinity;
        const bv = b.performance != null ? Number(b.performance) : -Infinity;
        cmp = av - bv;
      } else {
        const at = a.last_synced_at ? new Date(a.last_synced_at).getTime() : 0;
        const bt = b.last_synced_at ? new Date(b.last_synced_at).getTime() : 0;
        cmp = at - bt;
      }
      return sortAsc ? cmp : -cmp;
    });
    return rows;
  }, [initialRows, minPerformanceScore, sortKey, sortAsc]);

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
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-50">Lighthouse · PageSpeed</h1>
          <p className="text-zinc-500 mt-1 max-w-2xl text-sm">
            Mobile Lighthouse category scores from the{" "}
            <a
              className="text-sky-400/90 underline-offset-2 hover:underline"
              href="https://developers.google.com/speed/docs/insights/v5/get-started"
              rel="noreferrer"
              target="_blank"
            >
              PageSpeed Insights API
            </a>
            , stored on the current month&apos;s{" "}
            <code className="rounded bg-zinc-800 px-1 font-mono text-[11px] text-zinc-300">client_metrics</code> row
            when you run <span className="font-medium text-zinc-400">Sync metrics</span>. Set each client&apos;s{" "}
            <span className="font-medium text-zinc-400">website</span> URL and add{" "}
            <code className="rounded bg-zinc-800 px-1 font-mono text-[11px] text-zinc-300">GOOGLE_PAGESPEED_API_KEY</code>{" "}
            to <code className="rounded bg-zinc-800 px-1 font-mono text-[11px] text-zinc-300">.env.local</code>. Alerts
            use the performance threshold from <span className="font-medium text-zinc-400">Settings</span> (currently{" "}
            <span className="font-medium text-zinc-300">{minPerformanceScore}</span>). This button runs{" "}
            <span className="font-medium text-zinc-400">Lighthouse-only</span> sync (faster than Sync all).
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="default"
            disabled={isSyncing}
            onClick={() => void runSyncMetrics()}
            className="bg-gradient-to-r from-cyan-600 to-blue-600 text-white hover:opacity-95 disabled:opacity-60"
          >
            {isSyncing ? (
              <>
                <Loader2 className="mr-2 size-4 shrink-0 animate-spin" aria-hidden />
                Syncing…
              </>
            ) : (
              <>
                <RefreshCw className="mr-2 size-4 shrink-0" aria-hidden />
                Sync metrics
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
              <TableHead className="max-w-[200px] text-zinc-500">Audited URL</TableHead>
              <TableHead className="text-right text-zinc-500">
                <button
                  type="button"
                  className="font-medium uppercase tracking-wide hover:text-zinc-300"
                  onClick={() => toggleSort("performance")}
                >
                  Performance{sortKey === "performance" ? (sortAsc ? " ↑" : " ↓") : ""}
                </button>
              </TableHead>
              <TableHead className="text-right text-zinc-500">Accessibility</TableHead>
              <TableHead className="text-right text-zinc-500">SEO</TableHead>
              <TableHead className="text-right text-zinc-500">Best practices</TableHead>
              <TableHead className="min-w-[140px] text-zinc-500">PSI note</TableHead>
              <TableHead className="min-w-[140px] text-zinc-500">
                <button
                  type="button"
                  className="font-medium uppercase tracking-wide hover:text-zinc-300"
                  onClick={() => toggleSort("synced")}
                >
                  Last synced{sortKey === "synced" ? (sortAsc ? " ↑" : " ↓") : ""}
                </button>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedRows.length === 0 ? (
              <TableRow className="border-zinc-800 hover:bg-zinc-950/40">
                <TableCell colSpan={9} className="text-zinc-500 py-10 text-center text-sm">
                  No clients yet.
                </TableCell>
              </TableRow>
            ) : (
              sortedRows.map((row) => {
                const health = lighthouseRowHealth(row, minPerformanceScore);
                const displayUrl = row.auditedUrl ?? normalizeWebsiteForPageSpeed(row.website);
                return (
                  <TableRow key={row.client.id} className="border-zinc-800 hover:bg-zinc-950/50">
                    <TableCell>
                      <StatusDot status={health} />
                    </TableCell>
                    <TableCell className="font-medium">
                      <Link
                        href={`/dashboard/clients/${row.client.id}`}
                        className="text-zinc-100 hover:text-blue-400 cursor-pointer transition-colors"
                      >
                        {row.client.business_name}
                      </Link>
                    </TableCell>
                    <TableCell className="max-w-[220px]">
                      {displayUrl ? (
                        <a
                          href={displayUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="block truncate text-xs text-sky-400/90 hover:underline"
                          title={displayUrl}
                        >
                          {displayUrl}
                        </a>
                      ) : (
                        <span className="text-zinc-600 text-xs">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-zinc-200">{formatScore(row.performance)}</TableCell>
                    <TableCell className="text-right tabular-nums text-zinc-200">
                      {formatScore(row.accessibility)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-zinc-200">{formatScore(row.seo)}</TableCell>
                    <TableCell className="text-right tabular-nums text-zinc-200">
                      {formatScore(row.bestPractices)}
                    </TableCell>
                    <TableCell className="max-w-[200px]">
                      {row.lighthouse_error?.trim() ? (
                        <p
                          className="line-clamp-2 text-left text-[11px] leading-snug text-amber-200/90"
                          title={row.lighthouse_error}
                        >
                          {row.lighthouse_error}
                        </p>
                      ) : (
                        <span className="text-zinc-600 text-xs">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-zinc-500 whitespace-nowrap">
                      {row.last_synced_at ? new Date(row.last_synced_at).toLocaleString() : "—"}
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
