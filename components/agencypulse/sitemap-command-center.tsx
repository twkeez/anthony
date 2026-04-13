"use client";

import { Loader2, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import type { SitemapCommandCenterRow } from "@/lib/data/sitemap-command-center";
import { useDashboardSync } from "@/lib/context/dashboard-sync-context";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

const glass = "rounded-xl border border-zinc-800 bg-zinc-900/90 shadow-sm";

function utcCalendarDay(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function daysSinceSitemapDownload(iso: string | null | undefined): number | null {
  if (iso == null || iso === "") return null;
  const crawled = new Date(iso);
  if (Number.isNaN(crawled.getTime())) return null;
  const diffDays = Math.floor((utcCalendarDay(new Date()) - utcCalendarDay(crawled)) / 86400000);
  return diffDays >= 0 ? diffDays : null;
}

function formatLastCrawled(iso: string | null | undefined): string {
  if (iso == null || iso === "") return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(d);
}

function formatCount(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  return Math.round(Number(n)).toLocaleString();
}

function sitemapHealthRank(row: SitemapCommandCenterRow): number {
  const gsc = row.client.search_console_url?.trim();
  if (!gsc) return 3;
  const status = row.sitemap_status?.trim() ?? "";
  const days = daysSinceSitemapDownload(row.sitemap_last_downloaded);
  if (status === "Error" || !status) return 0;
  if (days != null && days > 90) return 1;
  if (status === "Success" || status === "Submitted") return 2;
  return 1;
}

function StatusDot({ row }: { row: SitemapCommandCenterRow }) {
  const gsc = row.client.search_console_url?.trim();
  if (!gsc) {
    return (
      <span className="flex items-center justify-center" title="No GSC URL">
        <span className={cn("size-3 shrink-0 rounded-full bg-zinc-600")} aria-hidden />
      </span>
    );
  }
  const r = sitemapHealthRank(row);
  const cls =
    r === 0
      ? "bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.45)]"
      : r === 1
        ? "bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.35)]"
        : r === 2
          ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.35)]"
          : "bg-zinc-600";
  const title =
    r === 0 ? "Error or missing status" : r === 1 ? "Stale or pending" : r === 2 ? "Healthy" : "Unknown";
  return (
    <span className="flex items-center justify-center" title={title}>
      <span className={cn("size-3 shrink-0 rounded-full", cls)} aria-hidden />
    </span>
  );
}

type SortKey = "status" | "name" | "synced";

export function SitemapCommandCenter({ initialRows }: { initialRows: SitemapCommandCenterRow[] }) {
  const router = useRouter();
  const [sortKey, setSortKey] = useState<SortKey>("status");
  const [sortAsc, setSortAsc] = useState(true);
  const { runScopedSync, isSyncing } = useDashboardSync();

  const runSyncGsc = useCallback(async () => {
    const res = await runScopedSync("gsc");
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
    rows.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "status") {
        cmp = sitemapHealthRank(a) - sitemapHealthRank(b);
      } else if (sortKey === "name") {
        cmp = a.client.business_name.localeCompare(b.client.business_name);
      } else {
        const at = a.last_synced_at ? new Date(a.last_synced_at).getTime() : 0;
        const bt = b.last_synced_at ? new Date(b.last_synced_at).getTime() : 0;
        cmp = at - bt;
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
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-50">Sitemap & Search Console</h1>
          <p className="text-zinc-500 mt-1 max-w-xl text-sm">
            Agency-wide GSC sitemap status, organic totals (~30 days), and last sync — same data as client Overview
            SEO blocks. <span className="text-zinc-400">Sync GSC</span> runs Search Analytics + sitemap only (faster than
            Sync all).
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="default"
            disabled={isSyncing}
            onClick={() => void runSyncGsc()}
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
                Sync GSC
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
              <TableHead className="text-zinc-500 max-w-[200px]">GSC property</TableHead>
              <TableHead className="text-zinc-500 max-w-[200px]">Sitemap URL</TableHead>
              <TableHead className="text-zinc-500">Sitemap status</TableHead>
              <TableHead className="text-zinc-500">Last crawled</TableHead>
              <TableHead className="text-right text-zinc-500">Organic clicks</TableHead>
              <TableHead className="text-right text-zinc-500">Organic impr.</TableHead>
              <TableHead className="text-zinc-500">
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
                const gsc = row.client.search_console_url?.trim();
                const days = daysSinceSitemapDownload(row.sitemap_last_downloaded);
                return (
                  <TableRow key={row.client.id} className="border-zinc-800 hover:bg-zinc-950/50">
                    <TableCell>
                      <StatusDot row={row} />
                    </TableCell>
                    <TableCell className="font-medium">
                      <Link
                        href={`/dashboard/clients/${row.client.id}`}
                        className="text-zinc-100 hover:text-blue-400 cursor-pointer transition-colors"
                      >
                        {row.client.business_name}
                      </Link>
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate text-xs text-zinc-400" title={gsc ?? ""}>
                      {gsc || "—"}
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate text-xs text-zinc-400" title={row.sitemap_url ?? ""}>
                      {row.sitemap_url || "—"}
                    </TableCell>
                    <TableCell className="text-sm text-zinc-300">
                      {row.sitemap_status || "—"}
                      {days != null ? (
                        <span className="text-zinc-500 block text-xs">{days}d since crawl</span>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-xs text-zinc-400">
                      {formatLastCrawled(row.sitemap_last_downloaded)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-zinc-200">
                      {formatCount(row.organic_clicks)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-zinc-200">
                      {formatCount(row.organic_impressions)}
                    </TableCell>
                    <TableCell className="text-xs text-zinc-500">
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
