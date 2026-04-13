"use client";

import { Loader2, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useLayoutEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import {
  activeAlertBadges,
  adsHealthSortRank,
  calculateAdAccountStatus,
  type AdsAccountHealth,
} from "@/lib/agency-hub/google-ads-account-status";
import {
  DEFAULT_GOOGLE_ADS_RULES_CONFIG,
  loadGoogleAdsRulesConfig,
  saveGoogleAdsRulesConfig,
} from "@/lib/agency-hub/google-ads-rules-config";
import type { GoogleAdsRulesConfig } from "@/lib/agency-hub/google-ads-rules-config";
import type { AdsCommandCenterRow } from "@/lib/data/ads-command-center";
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
import { cn } from "@/lib/utils";

const glass = "rounded-xl border border-zinc-800 bg-zinc-900/90 shadow-sm";

function formatSpend(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Number(n));
}

function formatConversions(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(Number(n));
}

function formatCpa(spend: number | null | undefined, conv: number | null | undefined): string {
  if (spend == null || conv == null || !Number.isFinite(Number(spend)) || !Number.isFinite(Number(conv))) {
    return "—";
  }
  if (Number(conv) <= 0) return "—";
  const cpa = Number(spend) / Number(conv);
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cpa);
}

function StatusDot({ status }: { status: AdsAccountHealth }) {
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

type SortKey = "status" | "name" | "spend" | "synced";

export function AdsCommandCenter({ initialRows }: { initialRows: AdsCommandCenterRow[] }) {
  const router = useRouter();
  const [rulesOpen, setRulesOpen] = useState(false);
  const [rules, setRules] = useState<GoogleAdsRulesConfig>(DEFAULT_GOOGLE_ADS_RULES_CONFIG);
  const [sortKey, setSortKey] = useState<SortKey>("status");
  const [sortAsc, setSortAsc] = useState(true);
  const { runScopedSync, isSyncing } = useDashboardSync();

  const runSyncAds = useCallback(async () => {
    const res = await runScopedSync("ads");
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
      setRules(loadGoogleAdsRulesConfig());
    } catch {
      /* ignore */
    }
  }, []);

  const setRule = useCallback((patch: Partial<GoogleAdsRulesConfig>) => {
    setRules((prev) => {
      const next = { ...prev, ...patch };
      saveGoogleAdsRulesConfig(next);
      return next;
    });
  }, []);

  const sortedRows = useMemo(() => {
    const rows = [...initialRows];
    const health = (r: AdsCommandCenterRow) =>
      calculateAdAccountStatus(r.client, r.google_ads_alerts, rules);

    rows.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "status") {
        cmp = adsHealthSortRank(health(a)) - adsHealthSortRank(health(b));
      } else if (sortKey === "name") {
        cmp = a.client.business_name.localeCompare(b.client.business_name);
      } else if (sortKey === "spend") {
        const av = a.ads_spend != null ? Number(a.ads_spend) : -Infinity;
        const bv = b.ads_spend != null ? Number(b.ads_spend) : -Infinity;
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
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-50">Google Ads Command Center</h1>
          <p className="text-zinc-500 mt-1 max-w-xl text-sm">
            Agency-wide account health from synced metrics and rule flags. Configure which rules drive traffic-light
            status (stored in this browser until agency settings are wired).{" "}
            <span className="text-zinc-400">Sync Ads only</span> pulls Google Ads + alert flags for every client (faster
            than Sync all).
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="default"
            disabled={isSyncing}
            onClick={() => void runSyncAds()}
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
                Sync Ads
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
              <TableHead className="text-zinc-500">Ads account ID</TableHead>
              <TableHead className="text-right text-zinc-500">
                <button
                  type="button"
                  className="font-medium uppercase tracking-wide hover:text-zinc-300"
                  onClick={() => toggleSort("spend")}
                >
                  30-day spend{sortKey === "spend" ? (sortAsc ? " ↑" : " ↓") : ""}
                </button>
              </TableHead>
              <TableHead className="text-right text-zinc-500">Conversions</TableHead>
              <TableHead className="text-right text-zinc-500">CPA</TableHead>
              <TableHead className="text-zinc-500">Active alerts</TableHead>
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
                <TableCell colSpan={8} className="text-zinc-500 py-10 text-center text-sm">
                  No clients yet.
                </TableCell>
              </TableRow>
            ) : (
              sortedRows.map((row) => {
                const health = calculateAdAccountStatus(row.client, row.google_ads_alerts, rules);
                const badges = activeAlertBadges(row.google_ads_alerts, rules);
                const cid = row.client.google_ads_customer_id?.trim();
                return (
                  <TableRow
                    key={row.client.id}
                    className="border-zinc-800 hover:bg-zinc-950/50"
                  >
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
                    <TableCell className="font-mono text-xs text-zinc-400">{cid || "—"}</TableCell>
                    <TableCell className="text-right tabular-nums text-zinc-200">
                      {formatSpend(row.ads_spend)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-zinc-200">
                      {formatConversions(row.ads_conversions)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-zinc-200">
                      {formatCpa(row.ads_spend, row.ads_conversions)}
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

      <Dialog open={rulesOpen} onOpenChange={setRulesOpen}>
        <DialogContent
          showCloseButton
          className="max-w-md border-zinc-800 bg-zinc-900 text-zinc-100 ring-zinc-700"
        >
          <DialogHeader>
            <DialogTitle className="text-zinc-50">Ads rule engine</DialogTitle>
            <DialogDescription className="text-zinc-500">
              Toggles apply to status colors and badges on this device. Flatline is RED; policy, tracking, and spend
              rules are YELLOW when triggered.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <RuleToggleRow
              id="flatline"
              label="Flatline"
              description="0 impressions in the last 48 hours (RED when enabled & triggered)."
              checked={rules.rule_flatline_enabled}
              onCheckedChange={(v) => setRule({ rule_flatline_enabled: Boolean(v) })}
            />
            <RuleToggleRow
              id="policy"
              label="Policy"
              description="Has disapproved ads (YELLOW)."
              checked={rules.rule_policy_enabled}
              onCheckedChange={(v) => setRule({ rule_policy_enabled: Boolean(v) })}
            />
            <RuleToggleRow
              id="tracking"
              label="Broken tracking"
              description="&gt;50 clicks but 0 conversions in the last 7 days (YELLOW)."
              checked={rules.rule_broken_tracking_enabled}
              onCheckedChange={(v) => setRule({ rule_broken_tracking_enabled: Boolean(v) })}
            />
            <RuleToggleRow
              id="spend"
              label="Spend drop"
              description="Yesterday spend &gt;50% below 14-day average (YELLOW)."
              checked={rules.rule_spend_drop_enabled}
              onCheckedChange={(v) => setRule({ rule_spend_drop_enabled: Boolean(v) })}
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
