"use client";

import { Loader2, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useLayoutEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import {
  activeGa4AlertBadges,
  calculateGa4AccountStatus,
  ga4HealthSortRank,
  type Ga4AccountHealth,
} from "@/lib/agency-hub/ga4-analytics-status";
import {
  DEFAULT_GA4_RULES_CONFIG,
  loadGa4RulesConfig,
  saveGa4RulesConfig,
} from "@/lib/agency-hub/ga4-rules-config";
import type { Ga4RulesConfig } from "@/lib/agency-hub/ga4-rules-config";
import type { Ga4CommandCenterRow } from "@/lib/data/ga4-command-center";
import { useDashboardSync } from "@/lib/context/dashboard-sync-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { compactGa4PropertyIdIssue } from "@/lib/google/ga4-property-id";
import { cn } from "@/lib/utils";

const glass = "rounded-xl border border-zinc-800 bg-zinc-900/90 shadow-sm";

function formatCount(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  return Math.round(Number(n)).toLocaleString();
}

function formatEngagementRate(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  return `${(Number(n) * 100).toFixed(1)}%`;
}

function StatusDot({ status }: { status: Ga4AccountHealth }) {
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

type SortKey = "status" | "name" | "propertyId" | "sessions" | "keyEvents" | "engagement" | "synced";

export function Ga4CommandCenter({ initialRows }: { initialRows: Ga4CommandCenterRow[] }) {
  const router = useRouter();
  const [rulesOpen, setRulesOpen] = useState(false);
  const [rules, setRules] = useState<Ga4RulesConfig>(DEFAULT_GA4_RULES_CONFIG);
  const [sortKey, setSortKey] = useState<SortKey>("status");
  const [sortAsc, setSortAsc] = useState(true);
  const { runScopedSync, isSyncing } = useDashboardSync();

  const runSyncMetrics = useCallback(async () => {
    const res = await runScopedSync("ga4");
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

  useLayoutEffect(() => {
    try {
      /* eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate rule toggles from localStorage after mount */
      setRules(loadGa4RulesConfig());
    } catch {
      /* ignore */
    }
  }, []);

  const setRule = useCallback((patch: Partial<Ga4RulesConfig>) => {
    setRules((prev) => {
      const next = { ...prev, ...patch };
      saveGa4RulesConfig(next);
      return next;
    });
  }, []);

  const rowGa4Metrics = (r: Ga4CommandCenterRow) => ({
    ga4_sessions: r.ga4_sessions,
    ga4_key_events: r.ga4_key_events,
    ga4_engagement_rate: r.ga4_engagement_rate,
  });

  const sortedRows = useMemo(() => {
    const rows = [...initialRows];
    const health = (r: Ga4CommandCenterRow) =>
      calculateGa4AccountStatus(r.client, r.ga4_alerts, rules, rowGa4Metrics(r));

    rows.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "status") {
        cmp = ga4HealthSortRank(health(a)) - ga4HealthSortRank(health(b));
      } else if (sortKey === "name") {
        cmp = a.client.business_name.localeCompare(b.client.business_name);
      } else if (sortKey === "propertyId") {
        cmp = (a.client.ga4_property_id ?? "").localeCompare(b.client.ga4_property_id ?? "");
      } else if (sortKey === "sessions") {
        const av = a.ga4_sessions != null ? Number(a.ga4_sessions) : -Infinity;
        const bv = b.ga4_sessions != null ? Number(b.ga4_sessions) : -Infinity;
        cmp = av - bv;
      } else if (sortKey === "keyEvents") {
        const av = a.ga4_key_events != null ? Number(a.ga4_key_events) : -Infinity;
        const bv = b.ga4_key_events != null ? Number(b.ga4_key_events) : -Infinity;
        cmp = av - bv;
      } else if (sortKey === "engagement") {
        const av = a.ga4_engagement_rate != null ? Number(a.ga4_engagement_rate) : -Infinity;
        const bv = b.ga4_engagement_rate != null ? Number(b.ga4_engagement_rate) : -Infinity;
        cmp = av - bv;
      } else {
        const at = a.last_synced_at ? new Date(a.last_synced_at).getTime() : 0;
        const bt = b.last_synced_at ? new Date(b.last_synced_at).getTime() : 0;
        cmp = at - bt;
      }
      return sortAsc ? cmp : -cmp;
    });
    return rows;
  }, [initialRows, rules, sortKey, sortAsc]);

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
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-50">GA4 Command Center</h1>
          <p className="text-zinc-500 mt-1 max-w-2xl text-sm">
            Numbers come from the last successful GA4 Data API pull (stored on the current month&apos;s{" "}
            <code className="rounded bg-zinc-800 px-1 font-mono text-[11px] text-zinc-300">client_metrics</code> row).
            Save the numeric <span className="font-medium text-zinc-400">GA4 property ID</span> under each client&apos;s
            Settings (not only Assets view), then run <span className="font-medium text-zinc-400">Sync metrics</span>.
            Amber status means the ID is set but no totals were returned (permission, wrong ID, or API error — see the
            sync note column or server logs). This button runs a <span className="font-medium text-zinc-400">GA4-only</span>{" "}
            sync (faster than header Sync all).
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
          <Button
            type="button"
            variant="outline"
            className="border-zinc-600 bg-zinc-950 text-zinc-100 hover:bg-zinc-800"
            onClick={() => setRulesOpen(true)}
          >
            Configure rules
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
              <TableHead className="text-zinc-500">
                <button
                  type="button"
                  className="font-medium uppercase tracking-wide hover:text-zinc-300"
                  onClick={() => toggleSort("propertyId")}
                >
                  GA4 property ID{sortKey === "propertyId" ? (sortAsc ? " ↑" : " ↓") : ""}
                </button>
              </TableHead>
              <TableHead className="text-right text-zinc-500">
                <button
                  type="button"
                  className="font-medium uppercase tracking-wide hover:text-zinc-300"
                  onClick={() => toggleSort("sessions")}
                >
                  Sessions (30d){sortKey === "sessions" ? (sortAsc ? " ↑" : " ↓") : ""}
                </button>
              </TableHead>
              <TableHead className="text-right text-zinc-500">
                <button
                  type="button"
                  className="font-medium uppercase tracking-wide hover:text-zinc-300"
                  onClick={() => toggleSort("keyEvents")}
                >
                  Key events (30d){sortKey === "keyEvents" ? (sortAsc ? " ↑" : " ↓") : ""}
                </button>
              </TableHead>
              <TableHead className="text-right text-zinc-500">
                <button
                  type="button"
                  className="font-medium uppercase tracking-wide hover:text-zinc-300"
                  onClick={() => toggleSort("engagement")}
                >
                  Engagement rate{sortKey === "engagement" ? (sortAsc ? " ↑" : " ↓") : ""}
                </button>
              </TableHead>
              <TableHead className="text-zinc-500">Active GA4 alerts</TableHead>
              <TableHead className="min-w-[140px] text-zinc-500">
                <button
                  type="button"
                  className="font-medium uppercase tracking-wide hover:text-zinc-300"
                  onClick={() => toggleSort("synced")}
                >
                  Last synced{sortKey === "synced" ? (sortAsc ? " ↑" : " ↓") : ""}
                </button>
              </TableHead>
              <TableHead className="min-w-[180px] text-zinc-500">Sync note</TableHead>
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
                const health = calculateGa4AccountStatus(row.client, row.ga4_alerts, rules, rowGa4Metrics(row));
                const badges = activeGa4AlertBadges(row.ga4_alerts, rules);
                const ga4IdIssue = compactGa4PropertyIdIssue(row.client.ga4_property_id);
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
                    <TableCell className="max-w-[200px]">
                      {row.client.ga4_property_id?.trim() ? (
                        <div className="min-w-0">
                          <code
                            className="block truncate text-xs text-zinc-300"
                            title={row.client.ga4_property_id.trim()}
                          >
                            {row.client.ga4_property_id.trim()}
                          </code>
                          {ga4IdIssue ? (
                            <p className="mt-1 text-[10px] leading-snug text-amber-200/85">{ga4IdIssue}</p>
                          ) : null}
                        </div>
                      ) : (
                        <span className="text-zinc-600 text-xs">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-zinc-200">
                      {formatCount(row.ga4_sessions)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-zinc-200">
                      {formatCount(row.ga4_key_events)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-zinc-200">
                      {formatEngagementRate(row.ga4_engagement_rate)}
                    </TableCell>
                    <TableCell className="max-w-[200px] whitespace-normal">
                      <div className="flex flex-wrap gap-1">
                        {badges.length === 0 ? (
                          <span className="text-zinc-600 text-xs">—</span>
                        ) : (
                          badges.map((b) => (
                            <Badge
                              key={b.key}
                              variant="outline"
                              className={cn(
                                "border px-1.5 py-0 text-[10px] font-medium uppercase tracking-wide",
                                b.tone === "red"
                                  ? "border-red-500/40 bg-red-500/10 text-red-200"
                                  : "border-amber-500/35 bg-amber-500/10 text-amber-100",
                              )}
                            >
                              {b.label}
                            </Badge>
                          ))
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-zinc-500 whitespace-nowrap">
                      {row.last_synced_at ? new Date(row.last_synced_at).toLocaleString() : "—"}
                    </TableCell>
                    <TableCell className="max-w-[220px]">
                      {row.sync_error?.trim() ? (
                        <p
                          className="line-clamp-2 text-left text-[11px] leading-snug text-amber-200/90"
                          title={row.sync_error}
                        >
                          {row.sync_error}
                        </p>
                      ) : (
                        <span className="text-zinc-600 text-xs">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={rulesOpen} onOpenChange={setRulesOpen}>
        <DialogContent
          showCloseButton
          className="max-w-md border-zinc-800 bg-zinc-900 text-zinc-100 ring-zinc-700"
        >
          <DialogHeader>
            <DialogTitle className="text-zinc-50">GA4 rule engine</DialogTitle>
            <DialogDescription className="text-zinc-500">
              Toggles apply to status colors and badges on this device. Traffic cliff is RED; conversion ghost is
              YELLOW when triggered.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <RuleToggleRow
              id="ga4-traffic-cliff"
              label="Traffic cliff"
              description="Yesterday's sessions dropped >80% vs the same calendar day last week (RED)."
              checked={rules.rule_traffic_cliff_enabled}
              onCheckedChange={(v) => setRule({ rule_traffic_cliff_enabled: Boolean(v) })}
            />
            <RuleToggleRow
              id="ga4-conversion-ghost"
              label="Conversion ghost"
              description="Last 7 days: sessions > 100 but 0 key events (YELLOW)."
              checked={rules.rule_conversion_ghost_enabled}
              onCheckedChange={(v) => setRule({ rule_conversion_ghost_enabled: Boolean(v) })}
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RuleToggleRow({
  id,
  label,
  description,
  checked,
  onCheckedChange,
}: {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-3">
      <div className="min-w-0">
        <Label htmlFor={id} className="text-zinc-200">
          {label}
        </Label>
        <p className="text-zinc-500 mt-0.5 text-xs leading-relaxed">{description}</p>
      </div>
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={(v) => onCheckedChange(Boolean(v))}
        className="shrink-0"
      />
    </div>
  );
}
