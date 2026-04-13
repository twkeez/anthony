"use client";

import { useState, type ReactNode } from "react";
import {
  AlertCircle,
  AlertTriangle,
  Clock,
  DollarSign,
  ExternalLink,
  Eye,
  Lightbulb,
  Loader2,
  MousePointerClick,
  Search,
  Target,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";
import type { LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { generateClientVibeCheck } from "@/app/actions/client-insights";
import { normalizeActiveServices } from "@/lib/active-services";
import { cn } from "@/lib/utils";
import { buildGmailQueryForDomain } from "@/lib/services/gmail-domain-filter";
import {
  EMPTY_GOOGLE_ADS_ALERTS,
  parseGoogleAdsAlertsJson,
  type GoogleAdsAlertsState,
} from "@/lib/agency-hub/google-ads-account-status";
import {
  daysSinceLastContactFromIso,
  parseCommunicationAlertsJson,
  type CommunicationAlertsState,
} from "@/lib/agency-hub/communication-alerts";
import { EMPTY_GA4_ALERTS, parseGa4AlertsJson, type Ga4AlertsState } from "@/lib/agency-hub/ga4-analytics-status";
import type { ClientMetricsRow, TaskRow, TopOrganicQuery } from "@/types/database.types";
import type { ClientRow } from "@/types/client";

type Props = {
  client: ClientRow;
  initialTasks: TaskRow[];
  initialMetrics: ClientMetricsRow | null;
};

function formatUsd(n: number | null | undefined, digits = 2): string {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(Number(n));
}

/** Formats a 0–1 ratio as a percent string (e.g. 0.852 → 85.2%). */
function formatPct01(n: number | null | undefined, fractionDigits = 1): string {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  return `${(Number(n) * 100).toFixed(fractionDigits)}%`;
}

function formatSitemapLastCrawled(iso: string | null | undefined): string {
  if (iso == null || iso === "") return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(d);
}

function formatBasecampSyncedAt(iso: string | null | undefined): string {
  if (iso == null || iso === "") return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(d);
}

/** One-line summary for the Communication / Basecamp snapshot card. */
/** Message-board recency: green &lt; 8d (0–7), yellow 8–14d, red 15+d (UTC calendar days). */
function lastContactRecencyClass(contactDays: number | null): string {
  if (contactDays == null) return "text-zinc-500";
  if (contactDays < 8) return "text-emerald-400";
  if (contactDays < 15) return "text-amber-400";
  return "text-red-400";
}

function waitingOnBadgeLabel(comm: CommunicationAlertsState | null): string {
  if (!comm) return "Waiting on: —";
  if (comm.waitingForResponse === true) return "Waiting on: Agency";
  if (comm.waitingForResponse === false && comm.lastMessage) return "Waiting on: Client";
  if (comm.waitingForResponse === null && comm.lastMessage) return "Waiting on: Unknown";
  return "Waiting on: —";
}

function basecampCommunicationSnapshotMessage(
  comm: CommunicationAlertsState | null,
  hasMappedProject: boolean,
): string {
  if (!hasMappedProject) {
    return "No Basecamp project is mapped for this client, so project to-do lists are not fetched.";
  }
  if (!comm) {
    return "No communication snapshot on this month’s metrics row yet — use Sync metrics above (or wait for the next batch sync).";
  }
  const n = comm.overdueCount;
  if (comm.syncedAt) {
    if (n === 0) {
      return "Last sync wrote this snapshot: zero overdue open tasks with a past due date in the mapped project.";
    }
    return `Last sync wrote this snapshot: ${n} overdue open task${n === 1 ? "" : "s"} with a past due date (severity: ${comm.status}).`;
  }
  if (n === 0) {
    return "Snapshot on file shows no overdue tasks, but there is no sync timestamp — run Sync again to refresh.";
  }
  return `Snapshot on file lists ${n} overdue task${n === 1 ? "" : "s"}, but there is no sync timestamp — run Sync again to refresh.`;
}

/** Whole UTC days from sitemap last-download date to today (non-negative). */
function daysSinceSitemapCrawl(iso: string | null | undefined): number | null {
  if (iso == null || iso === "") return null;
  const crawled = new Date(iso);
  if (Number.isNaN(crawled.getTime())) return null;
  const utcDay = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const diffDays = Math.floor((utcDay(new Date()) - utcDay(crawled)) / 86400000);
  return diffDays >= 0 ? diffDays : null;
}

/** Value to paste into third-party sitemap generators (https URL; strips `sc-domain:`). */
function formatOrganicCount(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  return Math.round(Number(n)).toLocaleString();
}

function urlForSitemapGenerator(searchConsoleUrl: string): string {
  const t = searchConsoleUrl.trim();
  if (t.toLowerCase().startsWith("sc-domain:")) {
    const host = t.slice("sc-domain:".length).trim();
    return host ? `https://${host.replace(/^\/+|\/+$/g, "")}` : "";
  }
  return t;
}

function SeoSearchConsoleSitemapBlock({
  client,
  metrics,
}: {
  client: ClientRow;
  metrics: ClientMetricsRow | null;
}) {
  const [resubmitting, setResubmitting] = useState(false);

  const url = metrics?.sitemap_url ?? null;
  const status = metrics?.sitemap_status ?? null;
  const lastDl = metrics?.sitemap_last_downloaded ?? null;
  const daysSince = daysSinceSitemapCrawl(lastDl);
  const isStale = daysSince != null && daysSince > 90;

  const healthyFresh =
    !isStale && url != null && (status === "Success" || status === "Submitted");

  let dotClass = "bg-amber-500";
  let statusLabel = "Check Sitemap";
  let statusTextClass = "text-sm text-zinc-300";

  if (isStale) {
    dotClass = "bg-amber-500";
    statusLabel = "Stale: >90 Days";
    statusTextClass = "text-sm text-amber-400";
  } else if (healthyFresh) {
    dotClass = "bg-emerald-500";
    statusLabel = "Healthy";
    statusTextClass = "text-sm text-zinc-300";
  } else if (status === "Error") {
    dotClass = "bg-red-500";
  } else if (status === "Pending") {
    dotClass = "bg-amber-500";
  } else if (!url) {
    dotClass = "bg-amber-500";
  } else {
    dotClass = "bg-red-500";
  }

  const canResubmit = Boolean(url && client.search_console_url?.trim());
  const canGenerate = Boolean(client.search_console_url?.trim());

  const topQueries: TopOrganicQuery[] = metrics?.top_organic_queries ?? [];

  async function handleResubmit() {
    if (!canResubmit) return;
    setResubmitting(true);
    try {
      const res = await fetch(`/api/clients/${client.id}/sitemap/submit`, { method: "POST" });
      const data = (await res.json()) as { ok?: boolean; message?: string; error?: string; hint?: string };
      if (!res.ok) {
        const parts = [data.error, data.hint].filter((x): x is string => typeof x === "string" && x.trim() !== "");
        throw new Error(parts.length ? parts.join(" — ") : "Resubmit failed.");
      }
      toast.success(data.message ?? "Sitemap resubmitted to Search Console.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Resubmit failed.");
    } finally {
      setResubmitting(false);
    }
  }

  async function handleGenerate() {
    const raw = client.search_console_url?.trim();
    if (!raw) {
      toast.error("Set Search Console property URL in Settings first.");
      return;
    }
    const text = urlForSitemapGenerator(raw);
    if (!text) {
      toast.error("Could not build a URL for the generator.");
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      window.open("https://www.xml-sitemaps.com/", "_blank", "noopener,noreferrer");
      toast.success("Client URL copied to clipboard! Paste it into the generator.");
    } catch {
      toast.error("Could not copy to clipboard.");
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 rounded-lg border border-zinc-800/90 bg-zinc-950/50 p-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Organic clicks</p>
          <p className="mt-1 text-lg font-semibold tabular-nums tracking-tight text-zinc-100">
            {formatOrganicCount(metrics?.organic_clicks)}
          </p>
          <p className="text-xs text-zinc-500">Last 30 days · GSC</p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Impressions</p>
          <p className="mt-1 text-lg font-semibold tabular-nums tracking-tight text-zinc-100">
            {formatOrganicCount(metrics?.organic_impressions)}
          </p>
          <p className="text-xs text-zinc-500">Web search</p>
        </div>
      </div>

      <div className="space-y-3 rounded-lg border border-zinc-800/90 bg-zinc-950/40 p-3">
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Sitemap</p>
        <div className="min-w-0">
          {url ? (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="block truncate text-sm text-zinc-500 underline decoration-zinc-700 underline-offset-2 hover:text-zinc-400"
            >
              {url}
            </a>
          ) : (
            <p className="truncate text-sm text-zinc-500">No sitemap found</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className={`size-2 shrink-0 rounded-full ${dotClass}`} aria-hidden />
          <span className={statusTextClass}>{statusLabel}</span>
        </div>
        <p className="text-xs text-zinc-500">Last crawled: {formatSitemapLastCrawled(lastDl)}</p>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!canResubmit || resubmitting}
            onClick={() => void handleResubmit()}
            className="border-zinc-600 bg-transparent text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
          >
            {resubmitting ? (
              <>
                <Loader2 className="mr-1.5 size-3.5 shrink-0 animate-spin" aria-hidden />
                Resubmitting…
              </>
            ) : (
              "Resubmit"
            )}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!canGenerate}
            onClick={() => void handleGenerate()}
            className="border-zinc-600 bg-transparent text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
          >
            Generate
            <ExternalLink className="ml-1.5 size-3.5 opacity-70" aria-hidden />
          </Button>
        </div>
      </div>

      <div className="border-t border-zinc-800/80 pt-3">
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Top Search Terms</p>
        {topQueries.length === 0 ? (
          <p className="text-zinc-500 mt-2 text-xs leading-relaxed">
            No queries yet. Sync after Search Console has query data for this property.
          </p>
        ) : (
          <ul className="mt-2 space-y-2">
            {topQueries.map((q, i) => (
              <li
                key={`${q.query}-${i}`}
                className="flex items-baseline justify-between gap-3 border-b border-zinc-800/60 pb-2 last:border-b-0 last:pb-0"
              >
                <span className="min-w-0 truncate text-sm text-zinc-300" title={q.query}>
                  {q.query}
                </span>
                <span className="shrink-0 tabular-nums text-sm text-zinc-400">
                  {formatOrganicCount(q.clicks)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

const widgetCard = "bg-zinc-900 border border-zinc-800 rounded-xl p-5 shadow-sm";

function WidgetShell({
  icon: Icon,
  title,
  children,
  className,
  action,
}: {
  icon: LucideIcon;
  title: string;
  children: ReactNode;
  className?: string;
  action?: ReactNode;
}) {
  return (
    <div className={cn("flex flex-col gap-4", widgetCard, className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Icon className="text-zinc-500 size-4 shrink-0" aria-hidden />
          <h3 className="text-sm font-medium tracking-wider text-zinc-400 uppercase">{title}</h3>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {children}
    </div>
  );
}

function LossShareBar({
  label,
  value,
  barClass,
}: {
  label: string;
  value: number | null | undefined;
  barClass: string;
}) {
  const v = value != null && Number.isFinite(Number(value)) ? Number(value) : 0;
  const w = Math.min(100, Math.max(0, v * 100));
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="text-zinc-500">{label}</span>
        <span className="font-medium tabular-nums text-zinc-200">{formatPct01(value)}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-zinc-800/80">
        <div className={`h-full rounded-full transition-all ${barClass}`} style={{ width: `${w}%` }} />
      </div>
    </div>
  );
}

function CompetitiveAnalysisPanel({ metrics }: { metrics: ClientMetricsRow | null }) {
  return (
    <div className={cn(widgetCard)}>
      <div className="mb-4">
        <div className="flex items-center gap-2">
          <Eye className="text-zinc-500 size-4 shrink-0" aria-hidden />
          <h3 className="text-sm font-medium tracking-wider text-zinc-400 uppercase">Competitive analysis</h3>
        </div>
        <p className="text-zinc-500 mt-1 text-xs">Search auction signals · month to date</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-3 rounded-lg border border-zinc-800 bg-zinc-950/50 p-4">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium tracking-wide text-zinc-500 uppercase">Market visibility</span>
            <Eye className="size-4 text-zinc-500" aria-hidden />
          </div>
          <p className="text-3xl font-semibold tracking-tight text-zinc-100 tabular-nums">
            {formatPct01(metrics?.ads_search_impression_share)}
          </p>
          <p className="text-xs text-zinc-500">Search impression share</p>
        </div>

        <div className="flex flex-col gap-4 rounded-lg border border-zinc-800 bg-zinc-950/50 p-4 lg:col-span-2">
          <p className="text-xs font-medium tracking-wide text-zinc-500 uppercase">Loss analysis</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <LossShareBar
              label="Lost to budget"
              value={metrics?.ads_search_budget_lost_impression_share}
              barClass="bg-amber-500/90"
            />
            <LossShareBar
              label="Lost to rank"
              value={metrics?.ads_search_rank_lost_impression_share}
              barClass="bg-sky-500/90"
            />
          </div>
          <div className="border-zinc-800 space-y-2 border-t pt-3">
            {(metrics?.ads_search_budget_lost_impression_share != null &&
              Number(metrics.ads_search_budget_lost_impression_share) > 0.2) ||
            (metrics?.ads_search_rank_lost_impression_share != null &&
              Number(metrics.ads_search_rank_lost_impression_share) > 0.2) ? (
              <p className="text-xs font-medium tracking-wide text-zinc-500 uppercase">Optimization tips</p>
            ) : null}
            {metrics?.ads_search_budget_lost_impression_share != null &&
            Number(metrics.ads_search_budget_lost_impression_share) > 0.2 ? (
              <div className="flex gap-2 rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                <Lightbulb className="mt-0.5 size-3.5 shrink-0 text-amber-400" aria-hidden />
                <span>Budget Limited: Increase spend to capture more volume.</span>
              </div>
            ) : null}
            {metrics?.ads_search_rank_lost_impression_share != null &&
            Number(metrics.ads_search_rank_lost_impression_share) > 0.2 ? (
              <div className="flex gap-2 rounded-lg border border-sky-500/25 bg-sky-500/10 px-3 py-2 text-xs text-sky-100">
                <Lightbulb className="mt-0.5 size-3.5 shrink-0 text-sky-400" aria-hidden />
                <span>Rank Limited: Improve Quality Score or Bids.</span>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-zinc-800 bg-zinc-950/50 p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium tracking-wide text-zinc-500 uppercase">Prominence</span>
          <TrendingUp className="size-4 text-zinc-500" aria-hidden />
        </div>
        <p className="mt-2 text-2xl font-semibold tracking-tight text-zinc-100 tabular-nums">
          {formatPct01(metrics?.ads_search_abs_top_impression_share)}
        </p>
        <p className="mt-1 text-xs text-zinc-500">Absolute top of page % (Search)</p>
      </div>
    </div>
  );
}

function SyncStatusBadge({ metrics }: { metrics: ClientMetricsRow | null }) {
  if (!metrics?.last_synced_at) {
    return (
      <Badge
        variant="outline"
        className="border-white/15 bg-white/5 text-zinc-400 hover:bg-white/5"
      >
        Awaiting first sync
      </Badge>
    );
  }
  if (metrics.sync_error?.trim()) {
    return (
      <Badge
        variant="outline"
        className="border-amber-500/40 bg-amber-500/10 text-amber-200 hover:bg-amber-500/15"
      >
        Sync issues
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className="border-emerald-500/40 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/20"
    >
      Sync Healthy
    </Badge>
  );
}

const midnightCard = "bg-zinc-900 border border-zinc-800 rounded-xl p-6 shadow-sm";

/** Persists rule-engine flags from the last metrics sync; shown for account managers on the client Overview. */
function GoogleAdsPerformanceAlerts({ metrics }: { metrics: ClientMetricsRow | null }) {
  const a = parseGoogleAdsAlertsJson(metrics?.google_ads_alerts as unknown) ?? EMPTY_GOOGLE_ADS_ALERTS;
  const banners: ReactNode[] = [];
  if (a.isFlatlined) {
    banners.push(
      <div
        key="flatline"
        role="status"
        className="flex items-center gap-2 rounded-md border border-red-500/50 bg-red-500/10 p-3 text-sm text-red-400"
      >
        <AlertTriangle className="size-4 shrink-0 text-red-400" aria-hidden />
        <span className="min-w-0 leading-snug">
          Critical: 0 Impressions in the last 48 hours. Check billing or account suspension.
        </span>
      </div>,
    );
  }
  if (a.hasDisapprovedAds) {
    banners.push(
      <div
        key="policy"
        role="status"
        className="flex items-center gap-2 rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm text-amber-300"
      >
        <AlertCircle className="size-4 shrink-0 text-amber-400" aria-hidden />
        <span className="min-w-0 leading-snug">Policy Warning: Account has disapproved ads.</span>
      </div>,
    );
  }
  if (a.brokenTracking) {
    banners.push(
      <div
        key="tracking"
        role="status"
        className="flex items-center gap-2 rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm text-amber-300"
      >
        <AlertCircle className="size-4 shrink-0 text-amber-400" aria-hidden />
        <span className="min-w-0 leading-snug">
          Tracking Warning: Clicks recorded, but 0 conversions in the last 7 days.
        </span>
      </div>,
    );
  }
  if (a.spendDrop) {
    banners.push(
      <div
        key="spend"
        role="status"
        className="flex items-center gap-2 rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm text-amber-300"
      >
        <AlertCircle className="size-4 shrink-0 text-amber-400" aria-hidden />
        <span className="min-w-0 leading-snug">
          Pacing Warning: Yesterday&apos;s spend dropped &gt;50% below the 14-day average.
        </span>
      </div>,
    );
  }
  if (!banners.length) return null;
  return <div className="space-y-3">{banners}</div>;
}

function Ga4PerformanceAlerts({ metrics }: { metrics: ClientMetricsRow | null }) {
  const a = parseGa4AlertsJson(metrics?.ga4_alerts as unknown) ?? EMPTY_GA4_ALERTS;
  const banners: ReactNode[] = [];
  if (a.isTrafficCliff) {
    banners.push(
      <div
        key="ga4-cliff"
        role="status"
        className="flex items-center gap-2 rounded-md border border-red-500/50 bg-red-500/10 p-3 text-sm text-red-400"
      >
        <AlertTriangle className="size-4 shrink-0 text-red-400" aria-hidden />
        <span className="min-w-0 leading-snug">
          CRITICAL: Traffic has flatlined. Check GA4 tag installation.
        </span>
      </div>,
    );
  }
  if (a.isConversionGhost) {
    banners.push(
      <div
        key="ga4-ghost"
        role="status"
        className="flex items-center gap-2 rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm text-amber-300"
      >
        <AlertCircle className="size-4 shrink-0 text-amber-400" aria-hidden />
        <span className="min-w-0 leading-snug">
          WARNING: High traffic but 0 key events. Check conversion tracking.
        </span>
      </div>,
    );
  }
  if (!banners.length) return null;
  return <div className="space-y-3">{banners}</div>;
}

function taskSort(a: TaskRow, b: TaskRow) {
  if (!a.due_date && !b.due_date) return 0;
  if (!a.due_date) return 1;
  if (!b.due_date) return -1;
  return a.due_date < b.due_date ? -1 : a.due_date > b.due_date ? 1 : 0;
}

function ServicePills({ services }: { services: ClientRow["active_services"] }) {
  const s = normalizeActiveServices(services);
  const labels: { key: keyof typeof s; label: string; dot: string }[] = [
    { key: "ppc", label: "PPC", dot: "bg-emerald-500" },
    { key: "seo", label: "SEO", dot: "bg-sky-500" },
    { key: "social", label: "Social", dot: "bg-violet-500" },
    { key: "orm", label: "ORM", dot: "bg-amber-500" },
  ];
  const active = labels.filter((x) => s[x.key]);
  if (!active.length) {
    return <span className="text-zinc-500 text-sm">No active services flagged yet.</span>;
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      {active.map((x) => (
        <span
          key={x.key}
          className="border-zinc-700 bg-zinc-900/60 text-zinc-200 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium"
        >
          <span className={cn("size-2 shrink-0 rounded-full", x.dot)} aria-hidden />
          {x.label}
        </span>
      ))}
    </div>
  );
}

export function ClientDetailView({ client: initialClient, initialTasks, initialMetrics }: Props) {
  const [client, setClient] = useState(initialClient);
  const [tasks, setTasks] = useState<TaskRow[]>(initialTasks);
  const [metrics, setMetrics] = useState<ClientMetricsRow | null>(initialMetrics);

  const [emailDomain, setEmailDomain] = useState(client.email_domain ?? "");
  const [adsId, setAdsId] = useState(client.google_ads_customer_id ?? "");
  const [ga4Id, setGa4Id] = useState(client.ga4_property_id ?? "");
  const [searchConsoleUrl, setSearchConsoleUrl] = useState(client.search_console_url ?? "");
  const [svc, setSvc] = useState(normalizeActiveServices(client.active_services));

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [dueDate, setDueDate] = useState("");

  const [profileMsg, setProfileMsg] = useState<string | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [adding, setAdding] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function saveProfile() {
    setSavingProfile(true);
    setProfileMsg(null);
    setError(null);
    try {
      const res = await fetch(`/api/clients/${client.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email_domain: emailDomain.trim() || null,
          google_ads_customer_id: adsId.trim() || null,
          ga4_property_id: ga4Id.trim() || null,
          search_console_url: searchConsoleUrl.trim() || null,
          active_services: svc,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        const parts = [data.error, data.details, data.hint].filter(
          (x: unknown) => typeof x === "string" && x.trim() !== "",
        ) as string[];
        throw new Error(parts.length ? parts.join(" — ") : "Save failed.");
      }
      const row = data.client as Record<string, unknown>;
      const next = {
        ...(row as unknown as ClientRow),
        active_services: normalizeActiveServices(row.active_services),
      };
      setClient(next);
      setProfileMsg("Saved.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setSavingProfile(false);
    }
  }

  async function addTask() {
    if (!title.trim()) {
      setError("Task title is required.");
      return;
    }
    setAdding(true);
    setError(null);
    try {
      const res = await fetch(`/api/clients/${client.id}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || null,
          assigned_to: assignedTo.trim() || null,
          due_date: dueDate.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not add task.");
      setTasks((prev) => [...prev, data.task as TaskRow].sort(taskSort));
      setTitle("");
      setDescription("");
      setAssignedTo("");
      setDueDate("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add task.");
    } finally {
      setAdding(false);
    }
  }

  async function toggleTask(t: TaskRow) {
    const nextStatus = t.status === "completed" ? "pending" : "completed";
    setTasks((prev) =>
      prev.map((x) => (x.id === t.id ? { ...x, status: nextStatus } : x)),
    );
    try {
      const res = await fetch(`/api/tasks/${t.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Update failed.");
      setTasks((prev) => prev.map((x) => (x.id === t.id ? (data.task as TaskRow) : x)));
    } catch (e) {
      setTasks((prev) => prev.map((x) => (x.id === t.id ? t : x)));
      setError(e instanceof Error ? e.message : "Update failed.");
    }
  }

  async function runSync() {
    setSyncing(true);
    setError(null);
    try {
      const res = await fetch(`/api/clients/${client.id}/sync`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Sync failed.");
      const m = data.metrics as {
        metric_month: string;
        ads_spend: number | null;
        ads_conversions: number | null;
        ads_clicks: number | null;
        ads_impressions: number | null;
        ads_ctr: number | null;
        ads_average_cpc: number | null;
        ads_search_impression_share: number | null;
        ads_search_rank_lost_impression_share: number | null;
        ads_search_budget_lost_impression_share: number | null;
        ads_search_abs_top_impression_share: number | null;
        ga4_sessions: number | null;
        ga4_key_events: number | null;
        ga4_engagement_rate: number | null;
        ga4_alerts: Ga4AlertsState | null;
        sitemap_url: string | null;
        sitemap_status: string | null;
        sitemap_last_downloaded: string | null;
        organic_clicks: number | null;
        organic_impressions: number | null;
        top_organic_queries: TopOrganicQuery[] | null;
        google_ads_alerts: GoogleAdsAlertsState | null;
        communication_alerts: CommunicationAlertsState | null;
        lighthouse_performance?: number | null;
        lighthouse_accessibility?: number | null;
        lighthouse_seo?: number | null;
        lighthouse_best_practices?: number | null;
        lighthouse_audited_url?: string | null;
        lighthouse_error?: string | null;
        last_synced_at: string;
        sync_error: string | null;
      };
      setMetrics((prev) => ({
        client_id: client.id,
        metric_month: m.metric_month,
        ads_spend: m.ads_spend,
        ads_conversions: m.ads_conversions,
        ads_clicks: m.ads_clicks,
        ads_impressions: m.ads_impressions ?? null,
        ads_ctr: m.ads_ctr ?? null,
        ads_average_cpc: m.ads_average_cpc ?? null,
        ads_search_impression_share: m.ads_search_impression_share ?? null,
        ads_search_rank_lost_impression_share: m.ads_search_rank_lost_impression_share ?? null,
        ads_search_budget_lost_impression_share: m.ads_search_budget_lost_impression_share ?? null,
        ads_search_abs_top_impression_share: m.ads_search_abs_top_impression_share ?? null,
        ga4_sessions: m.ga4_sessions,
        ga4_key_events: m.ga4_key_events,
        ga4_engagement_rate: m.ga4_engagement_rate ?? null,
        ga4_alerts: m.ga4_alerts ?? null,
        sitemap_url: m.sitemap_url ?? null,
        sitemap_status: m.sitemap_status ?? null,
        sitemap_last_downloaded: m.sitemap_last_downloaded ?? null,
        organic_clicks: m.organic_clicks ?? null,
        organic_impressions: m.organic_impressions ?? null,
        top_organic_queries: m.top_organic_queries ?? null,
        google_ads_alerts: m.google_ads_alerts ?? null,
        communication_alerts: parseCommunicationAlertsJson(m.communication_alerts as unknown),
        lighthouse_performance: m.lighthouse_performance ?? prev?.lighthouse_performance ?? null,
        lighthouse_accessibility: m.lighthouse_accessibility ?? prev?.lighthouse_accessibility ?? null,
        lighthouse_seo: m.lighthouse_seo ?? prev?.lighthouse_seo ?? null,
        lighthouse_best_practices: m.lighthouse_best_practices ?? prev?.lighthouse_best_practices ?? null,
        lighthouse_audited_url: m.lighthouse_audited_url ?? prev?.lighthouse_audited_url ?? null,
        lighthouse_error: m.lighthouse_error ?? prev?.lighthouse_error ?? null,
        ai_summary: prev?.ai_summary ?? null,
        last_synced_at: m.last_synced_at,
        sync_error: m.sync_error,
        updated_at: m.last_synced_at,
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sync failed.");
    } finally {
      setSyncing(false);
    }
  }

  async function runAi() {
    setAiLoading(true);
    setError(null);
    try {
      const result = await generateClientVibeCheck(client.id);
      if (!result.ok) throw new Error(result.error);
      const summary = result.summary;
      setMetrics((prev) =>
        prev
          ? { ...prev, ai_summary: summary }
          : {
              client_id: client.id,
              metric_month: new Date().toISOString().slice(0, 10),
              ads_spend: null,
              ads_conversions: null,
              ads_clicks: null,
              ads_impressions: null,
              ads_ctr: null,
              ads_average_cpc: null,
              ads_search_impression_share: null,
              ads_search_rank_lost_impression_share: null,
              ads_search_budget_lost_impression_share: null,
              ads_search_abs_top_impression_share: null,
              ga4_sessions: null,
              ga4_key_events: null,
              ga4_engagement_rate: null,
              ga4_alerts: null,
              sitemap_url: null,
              sitemap_status: null,
              sitemap_last_downloaded: null,
              organic_clicks: null,
              organic_impressions: null,
              top_organic_queries: null,
              google_ads_alerts: null,
              communication_alerts: null,
              lighthouse_performance: null,
              lighthouse_accessibility: null,
              lighthouse_seo: null,
              lighthouse_best_practices: null,
              lighthouse_audited_url: null,
              lighthouse_error: null,
              ai_summary: summary,
              last_synced_at: null,
              sync_error: null,
              updated_at: new Date().toISOString(),
            },
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "AI request failed.");
    } finally {
      setAiLoading(false);
    }
  }

  const gmailQuery = buildGmailQueryForDomain(emailDomain || client.email_domain);

  /** `clients.google_ads_customer_id` (Ads customer ID; hyphens stripped for the deep link). */
  const cleanAdsId = client.google_ads_customer_id?.trim().replace(/-/g, "") ?? "";
  /** Manager (MCC) context for `__m=` — agency master account, no hyphens. */
  const adsMasterMccId = "1234567890";
  const adsLink = cleanAdsId
    ? `https://ads.google.com/aw/overview?__c=${cleanAdsId}&__m=${adsMasterMccId}`
    : null;

  const fieldClass = "border-zinc-700 bg-zinc-950/80 text-zinc-100 placeholder:text-zinc-600";

  const profileSection = (
    <div className={cn(midnightCard, "grid gap-6")}>
      <div>
        <h2 className="text-lg font-semibold tracking-tight text-zinc-50">Connections & services</h2>
        <p className="text-zinc-500 mt-1 text-sm">
          Email domain, Ads, GA4, and Search Console property URL power sync and future comms filters.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="email_domain" className="text-zinc-400">
            Primary email domain
          </Label>
          <Input
            id="email_domain"
            className={fieldClass}
            placeholder="clientcompany.com"
            value={emailDomain}
            onChange={(e) => setEmailDomain(e.target.value)}
          />
        </div>
        <div className="grid gap-2">
          <Label className="text-zinc-400">Active services</Label>
          <div className="border-zinc-800 bg-zinc-950/40 grid gap-3 rounded-lg border p-3">
            {(
              [
                ["seo", "SEO"],
                ["ppc", "PPC"],
                ["social", "Social"],
                ["orm", "ORM"],
              ] as const
            ).map(([key, label]) => (
              <div key={key} className="flex items-center justify-between gap-3">
                <span className="text-sm text-zinc-300">{label}</span>
                <Switch
                  checked={svc[key]}
                  onCheckedChange={(v) => setSvc((s) => ({ ...s, [key]: Boolean(v) }))}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
      <Separator className="bg-zinc-800" />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="cid" className="text-zinc-400">
            Google Ads Customer ID
          </Label>
          <Input
            id="cid"
            className={fieldClass}
            placeholder="123-456-7890"
            value={adsId}
            onChange={(e) => setAdsId(e.target.value)}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="ga4" className="text-zinc-400">
            GA4 Property ID
          </Label>
          <Input
            id="ga4"
            className={fieldClass}
            placeholder="123456789"
            value={ga4Id}
            onChange={(e) => setGa4Id(e.target.value)}
          />
        </div>
        <div className="grid gap-2 sm:col-span-2">
          <Label htmlFor="gsc-site" className="text-zinc-400">
            Search Console property URL
          </Label>
          <Input
            id="gsc-site"
            className={fieldClass}
            placeholder="https://www.example.com/ or sc-domain:example.com"
            value={searchConsoleUrl}
            onChange={(e) => setSearchConsoleUrl(e.target.value)}
          />
          <p className="text-zinc-500 text-xs">
            Same URL as the property in Google Search Console (not the sitemap file). Sync pulls the primary sitemap
            from that property.
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          className="border-zinc-600 bg-zinc-800 text-zinc-100 hover:bg-zinc-700"
          onClick={saveProfile}
          disabled={savingProfile}
        >
          {savingProfile ? "Saving…" : "Save profile"}
        </Button>
      </div>
    </div>
  );

  const tabTriggerClass =
    "rounded-none border-0 border-b-2 border-transparent bg-transparent px-4 py-3 text-sm font-medium text-zinc-500 shadow-none ring-0 transition-colors after:hidden hover:text-zinc-200 data-active:border-sky-500 data-active:bg-transparent data-active:text-zinc-50 data-active:shadow-none";

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
      <header className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-4">
          <h1 className="text-3xl font-bold tracking-tight text-zinc-50">{client.business_name}</h1>
          <ServicePills services={client.active_services} />
          <div className="flex flex-wrap gap-x-8 gap-y-3">
            <div>
              <p className="text-xs font-medium tracking-wide text-zinc-500 uppercase">Total monthly budget</p>
              <p className="text-zinc-100 mt-0.5 text-lg font-semibold tabular-nums tracking-tight">
                {formatUsd(client.monthly_ad_budget)}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium tracking-wide text-zinc-500 uppercase">Target CPA</p>
              <p className="text-zinc-100 mt-0.5 text-lg font-semibold tabular-nums tracking-tight">
                {formatUsd(client.target_cpa)}
              </p>
            </div>
          </div>
          <p className="text-zinc-500 text-sm">
            {client.location ?? "No location"} · {client.account_group ?? "No group"}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-start gap-3 border-zinc-800 lg:items-end lg:border-l lg:pl-8">
          <SyncStatusBadge metrics={metrics} />
          {metrics?.last_synced_at ? (
            <div className="lg:text-right">
              <p className="text-xs font-medium tracking-wide text-zinc-500 uppercase">Last synced</p>
              <p className="text-zinc-100 mt-1 text-lg font-semibold tabular-nums tracking-tight">
                {new Date(metrics.last_synced_at).toLocaleString()}
              </p>
              <p className="text-zinc-500 mt-0.5 text-xs">
                Google Ads · month to date · GA4 · last 30 days + alerts · cache
              </p>
            </div>
          ) : (
            <p className="text-zinc-500 max-w-xs text-sm lg:text-right">Not synced yet. Use Sync on Overview.</p>
          )}
        </div>
      </header>

      <div
        className={cn(
          midnightCard,
          "border-sky-500/20 from-zinc-900/95 relative overflow-hidden border bg-gradient-to-br to-zinc-950 shadow-[inset_0_1px_0_0_rgba(56,189,248,0.06)]",
        )}
      >
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-zinc-50">Strategy Insight</h2>
            <p className="text-zinc-500 mt-1 max-w-2xl text-sm">
              AI director read of this month&apos;s performance metrics and{" "}
              <span className="font-medium text-zinc-400">communication_alerts</span> (Basecamp). Two sentences on
              health plus one Account Manager next step — stored in{" "}
              <code className="text-zinc-400">client_metrics.ai_summary</code>.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            className="border-sky-600/50 bg-sky-950/30 text-sky-100 hover:bg-sky-950/50 shrink-0"
            disabled={aiLoading}
            onClick={runAi}
          >
            {aiLoading ? (
              <>
                <Loader2 className="mr-2 size-4 shrink-0 animate-spin" aria-hidden />
                Generating…
              </>
            ) : (
              "Generate insight"
            )}
          </Button>
        </div>
        {metrics?.ai_summary?.trim() ? (
          <p className="text-zinc-200 min-w-0 text-sm leading-relaxed break-words whitespace-pre-wrap">
            {metrics.ai_summary.trim()}
          </p>
        ) : (
          <p className="text-zinc-500 text-sm">
            No insight yet. Run <span className="font-medium text-zinc-400">Sync metrics</span> on Overview, then
            generate — the model needs the current month row.
          </p>
        )}
      </div>

      {error ? <p className="text-red-400 text-sm">{error}</p> : null}
      {profileMsg ? <p className="text-emerald-400 text-sm">{profileMsg}</p> : null}

      <Tabs defaultValue="overview" className="w-full">
        <TabsList
          variant="line"
          className="h-auto w-full max-w-3xl justify-start gap-0 rounded-none border-b border-zinc-800 bg-transparent p-0"
        >
          <TabsTrigger value="overview" className={tabTriggerClass}>
            Overview
          </TabsTrigger>
          <TabsTrigger value="strategy" className={tabTriggerClass}>
            Strategy
          </TabsTrigger>
          <TabsTrigger value="assets" className={tabTriggerClass}>
            Assets
          </TabsTrigger>
          <TabsTrigger value="settings" className={tabTriggerClass}>
            Settings
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-8 grid gap-6">
          <div className={cn(midnightCard)}>
            <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold tracking-tight text-zinc-50">Performance</h2>
                <p className="text-sm text-zinc-400">
                  Google Ads · month to date · GA4 · last 30 days + alert rules · cached from last sync
                </p>
                {metrics?.last_synced_at ? (
                  <p className="mt-1 text-xs text-zinc-500">
                    Last synced {new Date(metrics.last_synced_at).toLocaleString()}
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-zinc-500">Not synced yet.</p>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {adsLink ? (
                  <a
                    href={adsLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-md border border-zinc-600 bg-transparent px-3 py-1.5 text-xs font-medium text-zinc-100 transition-colors hover:bg-zinc-800 sm:text-sm"
                  >
                    Open in Google Ads
                    <ExternalLink className="size-3.5 opacity-80" aria-hidden />
                  </a>
                ) : null}
                <Button
                  type="button"
                  variant="outline"
                  className="border-zinc-600 bg-transparent text-zinc-100 hover:bg-zinc-800"
                  disabled={syncing}
                  onClick={runSync}
                >
                  {syncing ? (
                    <>
                      <Loader2 className="mr-2 size-4 shrink-0 animate-spin" aria-hidden />
                      Syncing…
                    </>
                  ) : (
                    "Sync metrics"
                  )}
                </Button>
              </div>
            </div>

            {metrics?.sync_error ? (
              <p className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                {metrics.sync_error}
              </p>
            ) : null}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="flex flex-col gap-2 rounded-lg border border-zinc-800 bg-zinc-950/50 p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                    Total spend
                  </span>
                  <DollarSign className="size-4 text-zinc-500" aria-hidden />
                </div>
                <p className="text-4xl font-light tracking-tight text-emerald-400 tabular-nums">
                  {formatUsd(metrics?.ads_spend)}
                </p>
                <p className="text-xs text-zinc-500">Google Ads · month to date</p>
              </div>

              <div className="flex flex-col gap-2 rounded-lg border border-zinc-800 bg-zinc-950/50 p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                    Conversions
                  </span>
                  <Target className="size-4 text-zinc-500" aria-hidden />
                </div>
                <p className="text-2xl font-semibold tracking-tight text-zinc-50">
                  {metrics?.ads_conversions != null && Number.isFinite(Number(metrics.ads_conversions))
                    ? Number(metrics.ads_conversions).toLocaleString(undefined, {
                        maximumFractionDigits: 2,
                      })
                    : "—"}
                </p>
                <p className="text-xs text-zinc-500">
                  CPA{" "}
                  {(() => {
                    const spend = metrics?.ads_spend != null ? Number(metrics.ads_spend) : null;
                    const conv = metrics?.ads_conversions != null ? Number(metrics.ads_conversions) : null;
                    if (spend == null || conv == null || !Number.isFinite(spend) || !Number.isFinite(conv) || conv <= 0) {
                      return "—";
                    }
                    return formatUsd(spend / conv);
                  })()}
                </p>
              </div>

              <div className="flex flex-col gap-2 rounded-lg border border-zinc-800 bg-zinc-950/50 p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                    Traffic
                  </span>
                  <MousePointerClick className="size-4 text-zinc-500" aria-hidden />
                </div>
                <p className="text-2xl font-semibold tracking-tight text-zinc-50">
                  {metrics?.ads_clicks != null ? Number(metrics.ads_clicks).toLocaleString() : "—"}{" "}
                  <span className="text-base font-normal text-zinc-400">clicks</span>
                </p>
                <p className="text-xs text-zinc-500">
                  CTR{" "}
                  {metrics?.ads_ctr != null && Number.isFinite(Number(metrics.ads_ctr))
                    ? `${(Number(metrics.ads_ctr) * 100).toFixed(2)}%`
                    : "—"}
                </p>
              </div>

              <div className="flex flex-col gap-2 rounded-lg border border-zinc-800 bg-zinc-950/50 p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                    Efficiency
                  </span>
                  <TrendingUp className="size-4 text-zinc-500" aria-hidden />
                </div>
                <p className="text-2xl font-semibold tracking-tight text-zinc-50">
                  {formatUsd(metrics?.ads_average_cpc != null ? Number(metrics.ads_average_cpc) : null)}
                </p>
                <p className="text-xs text-zinc-500">Avg. CPC · Google Ads</p>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              <GoogleAdsPerformanceAlerts metrics={metrics} />
              <Ga4PerformanceAlerts metrics={metrics} />
              <div className="border-zinc-800 bg-zinc-950/40 grid gap-3 rounded-lg border p-4 sm:grid-cols-2">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">GA4</p>
                <p className="mt-1 text-sm text-zinc-300">
                  Sessions (30d):{" "}
                  <span className="font-medium text-zinc-50">{metrics?.ga4_sessions ?? "—"}</span>
                </p>
                <p className="text-sm text-zinc-300">
                  Key events (30d):{" "}
                  <span className="font-medium text-zinc-50">{metrics?.ga4_key_events ?? "—"}</span>
                </p>
                <p className="text-sm text-zinc-300">
                  Engagement rate:{" "}
                  <span className="font-medium text-zinc-50">
                    {formatPct01(metrics?.ga4_engagement_rate)}
                  </span>
                </p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Reach</p>
                <p className="mt-1 text-sm text-zinc-300">
                  Impressions:{" "}
                  <span className="font-medium text-zinc-50">
                    {metrics?.ads_impressions != null
                      ? Number(metrics.ads_impressions).toLocaleString()
                      : "—"}
                  </span>
                </p>
              </div>
            </div>
            </div>
          </div>

          <div className={cn(midnightCard, "grid gap-4 text-sm")}>
            <div>
              <h2 className="text-lg font-semibold tracking-tight text-zinc-50">Communication</h2>
              <p className="text-zinc-500 mt-1 text-sm">
                Overdue Basecamp to-dos for this client&apos;s mapped project (sync updates after each metrics sync).
                {!client.basecamp_project_id?.trim() ? (
                  <span className="text-amber-400/90 mt-1 block text-xs">
                    No <span className="font-medium text-zinc-300">basecamp_project_id</span> on this client — use the
                    Basecamp mapper under Developer tools to link a project.
                  </span>
                ) : null}
              </p>
            </div>
            {(() => {
              const comm = parseCommunicationAlertsJson(metrics?.communication_alerts as unknown);
              const tasks = comm?.tasks ?? [];
              const hasProject = Boolean(client.basecamp_project_id?.trim());
              const bcProjectId = (client.basecamp_project_id ?? "").trim();
              const contactDays =
                comm?.daysSinceLastContact != null && Number.isFinite(comm.daysSinceLastContact)
                  ? Math.round(comm.daysSinceLastContact)
                  : comm?.lastMessage?.updatedAt
                    ? daysSinceLastContactFromIso(comm.lastMessage.updatedAt)
                    : null;
              const lastAuthorDisplay = (comm?.lastMessageAuthor ?? comm?.lastMessage?.authorName ?? "").trim();

              return (
                <>
                  {hasProject ? (
                    <div className="border-violet-500/25 from-zinc-900/95 to-zinc-950 flex flex-col gap-4 rounded-xl border bg-gradient-to-r p-4 shadow-[0_0_0_1px_rgba(139,92,246,0.12)] ring-1 ring-violet-500/15 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
                      <div className="flex min-w-0 items-center gap-4">
                        <div className="border-violet-500/30 flex size-12 shrink-0 items-center justify-center rounded-xl border bg-zinc-950/80">
                          <Clock className="size-6 text-violet-300" aria-hidden />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xl font-black leading-tight tracking-tight sm:text-2xl">
                            <span className="text-zinc-500 text-sm font-semibold uppercase tracking-wide">
                              Last contact:{" "}
                            </span>
                            {contactDays != null ? (
                              <span className={lastContactRecencyClass(contactDays)}>
                                {contactDays === 0
                                  ? "today"
                                  : `${contactDays} day${contactDays === 1 ? "" : "s"} ago`}
                              </span>
                            ) : (
                              <span className="text-zinc-500 text-lg font-bold">— run Sync metrics</span>
                            )}
                          </p>
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end">
                        <Badge
                          variant="outline"
                          className={cn(
                            "w-fit border px-3 py-1 text-xs font-semibold",
                            comm?.waitingForResponse === true
                              ? "border-red-500/50 bg-red-950/50 text-red-200"
                              : comm?.waitingForResponse === false && comm?.lastMessage
                                ? "border-emerald-500/40 bg-emerald-950/30 text-emerald-200"
                                : "border-zinc-600 bg-zinc-900 text-zinc-300",
                          )}
                        >
                          {waitingOnBadgeLabel(comm)}
                        </Badge>
                        {lastAuthorDisplay ? (
                          <p className="text-zinc-500 flex max-w-[min(100%,18rem)] flex-wrap items-center justify-end gap-1.5 text-right text-xs">
                            <span>
                              Last poster:{" "}
                              <span className="font-bold text-zinc-100">{lastAuthorDisplay}</span>
                            </span>
                            {comm?.is_internal_author === true ? (
                              <span className="rounded-md border border-violet-400/35 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-violet-300 to-sky-300">
                                Agency
                              </span>
                            ) : null}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  ) : null}

                  <div className="border-zinc-800 bg-zinc-950/50 rounded-lg border p-3">
                    <p className="text-zinc-400 text-xs font-medium uppercase tracking-wide">Basecamp activity</p>
                    <dl className="mt-2 space-y-1.5 text-sm">
                      <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
                        <dt className="text-zinc-500 shrink-0">Last pull (stored)</dt>
                        <dd className="font-mono text-zinc-200 text-xs sm:text-right">
                          {formatBasecampSyncedAt(comm?.syncedAt)}
                        </dd>
                      </div>
                      {comm?.last_internal_reply_at ? (
                        <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
                          <dt className="text-zinc-500 shrink-0">Last agency reply (board)</dt>
                          <dd className="font-mono text-zinc-200 text-xs sm:text-right">
                            {formatBasecampSyncedAt(comm.last_internal_reply_at)}
                          </dd>
                        </div>
                      ) : null}
                      {hasProject ? (
                        <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
                          <dt className="text-zinc-500 shrink-0">Mapped project id</dt>
                          <dd className="font-mono text-zinc-200 text-xs sm:text-right">{bcProjectId}</dd>
                        </div>
                      ) : null}
                    </dl>
                    <p className="text-zinc-300 mt-3 text-sm leading-relaxed">
                      {basecampCommunicationSnapshotMessage(comm, hasProject)}
                    </p>
                  </div>

                  {hasProject ? (
                    <div
                      className={cn(
                        "rounded-lg border p-3",
                        comm?.waitingForResponse === true
                          ? "border-red-500/45 bg-red-950/20"
                          : "border-zinc-800 bg-zinc-950/50",
                      )}
                    >
                      <p className="text-zinc-400 text-xs font-medium uppercase tracking-wide">
                        Latest message board activity
                      </p>
                      {(() => {
                        const boardSnap = comm != null && "lastMessage" in comm;
                        if (comm?.lastMessage) {
                          const lm = comm.lastMessage;
                          const boldAuthor = (comm.lastMessageAuthor ?? lm.authorName ?? "").trim();
                          return (
                            <div className="mt-2 space-y-2">
                              {comm.waitingForResponse === true ? (
                                <p className="rounded-md border border-red-500/35 bg-red-950/40 px-2.5 py-1.5 text-xs font-medium text-red-200">
                                  Response needed — last board activity was not from your agency team
                                  {boldAuthor ? (
                                    <>
                                      {" "}
                                      (<span className="font-bold text-red-100">{boldAuthor}</span>).
                                    </>
                                  ) : (
                                    "."
                                  )}
                                </p>
                              ) : null}
                              <div className="flex flex-wrap items-start justify-between gap-2">
                                <h3 className="text-sm font-semibold text-zinc-100 pr-4">{lm.subject}</h3>
                                {lm.webUrl ? (
                                  <a
                                    href={lm.webUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex shrink-0 items-center gap-1 text-xs text-sky-400 hover:text-sky-300"
                                  >
                                    Open in Basecamp
                                    <ExternalLink className="size-3.5 opacity-80" aria-hidden />
                                  </a>
                                ) : null}
                              </div>
                              <p className="text-zinc-300 text-sm leading-relaxed whitespace-pre-wrap">
                                {lm.excerpt}
                              </p>
                              <p className="text-zinc-500 flex flex-wrap items-center gap-2 text-xs">
                                {boldAuthor ? (
                                  <>
                                    <span className="font-bold text-zinc-100">{boldAuthor}</span>
                                    {comm?.is_internal_author === true ? (
                                      <span className="rounded-md border border-violet-400/35 px-1.5 py-0.5 text-[10px] font-bold uppercase text-transparent bg-clip-text bg-gradient-to-r from-violet-300 to-sky-300">
                                        Agency
                                      </span>
                                    ) : null}
                                    <span>·</span>
                                  </>
                                ) : null}
                                <span>Updated {formatBasecampSyncedAt(lm.updatedAt)}</span>
                              </p>
                              <p className="text-zinc-600 text-[11px] leading-snug">
                                Most recently updated <span className="text-zinc-500">Message</span> thread on the
                                first page of project topics (excerpt is the latest comment or post body preview).
                              </p>
                            </div>
                          );
                        }
                        if (boardSnap && comm?.lastMessage === null && comm.syncedAt) {
                          return (
                            <p className="text-zinc-500 mt-2 text-sm">
                              No message-board threads matched on the last sync (no{" "}
                              <code className="text-zinc-400">Message</code>-type topics on the newest page, or the
                              topics endpoint returned none).
                            </p>
                          );
                        }
                        if (comm?.syncedAt) {
                          return (
                            <p className="text-zinc-500 mt-2 text-sm">
                              Re-run <span className="font-medium text-zinc-400">Sync metrics</span> to capture message
                              board activity; this snapshot was saved before message previews were added.
                            </p>
                          );
                        }
                        return (
                          <p className="text-zinc-500 mt-2 text-sm">
                            Run Sync metrics above to load the latest message board preview.
                          </p>
                        );
                      })()}
                    </div>
                  ) : null}

                  {!hasProject ? null : !tasks.length ? (
                    <p className="text-zinc-500 text-sm">
                      {comm?.syncedAt
                        ? "No overdue Basecamp tasks on the last sync."
                        : "Run Sync metrics above to pull Basecamp communication alerts."}
                    </p>
                  ) : (
                    <ul className="border-zinc-800 divide-y divide-zinc-800 rounded-lg border">
                      {tasks.map((t, i) => (
                        <li
                          key={`${t.name}-${i}`}
                          className="flex flex-col gap-0.5 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <span className="font-medium text-zinc-100">{t.name}</span>
                          <span className="text-zinc-500 shrink-0 text-xs tabular-nums">
                            {t.dueOn ? `Due ${t.dueOn}` : "No due date"} · {t.daysLate}d late
                            {t.projectName ? ` · ${t.projectName}` : ""}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              );
            })()}
            <div>
              <p className="text-zinc-500 text-xs uppercase">Suggested Gmail search</p>
              <code className="border-zinc-800 bg-zinc-950 mt-1 block rounded-lg border p-3 text-xs text-zinc-300">
                {gmailQuery || "Save a primary email domain to preview the Gmail query."}
              </code>
            </div>
            <p className="text-zinc-500 text-xs">
              Gmail filter helper: <code className="text-zinc-400">senderEmailMatchesClientDomain</code> in{" "}
              <code className="text-zinc-400">lib/services/gmail-domain-filter.ts</code>.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <WidgetShell icon={Search} title="SEO / Search Console">
              <p className="text-xs text-zinc-500">
                Organic performance (last 30 days) and sitemap tools from Search Console. Set{" "}
                <span className="font-medium text-zinc-400">Search Console property URL</span> under Settings →
                Connections, then Sync metrics.
              </p>
              <SeoSearchConsoleSitemapBlock client={client} metrics={metrics} />
            </WidgetShell>
          </div>

          <div className={cn(midnightCard)}>
            <div className="mb-5">
              <h2 className="text-lg font-semibold tracking-tight text-zinc-50">Competitive analysis</h2>
              <p className="text-sm text-zinc-400">
                Search auction signals · month to date · use with Search campaigns
              </p>
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              <div className="flex flex-col gap-3 rounded-lg border border-zinc-800 bg-zinc-950/50 p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                    Market visibility
                  </span>
                  <Eye className="size-4 text-zinc-500" aria-hidden />
                </div>
                <p className="text-3xl font-semibold tracking-tight text-zinc-50">
                  {formatPct01(metrics?.ads_search_impression_share)}
                </p>
                <p className="text-xs text-zinc-500">Search impression share</p>
              </div>

              <div className="flex flex-col gap-4 rounded-lg border border-zinc-800 bg-zinc-950/50 p-4 lg:col-span-2">
                <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Loss analysis</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <LossShareBar
                    label="Lost to budget"
                    value={metrics?.ads_search_budget_lost_impression_share}
                    barClass="bg-amber-500/90"
                  />
                  <LossShareBar
                    label="Lost to rank"
                    value={metrics?.ads_search_rank_lost_impression_share}
                    barClass="bg-sky-500/90"
                  />
                </div>
                <div className="border-zinc-800 space-y-2 border-t pt-3">
                  {(metrics?.ads_search_budget_lost_impression_share != null &&
                    Number(metrics.ads_search_budget_lost_impression_share) > 0.2) ||
                  (metrics?.ads_search_rank_lost_impression_share != null &&
                    Number(metrics.ads_search_rank_lost_impression_share) > 0.2) ? (
                    <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                      Optimization tips
                    </p>
                  ) : null}
                  {metrics?.ads_search_budget_lost_impression_share != null &&
                  Number(metrics.ads_search_budget_lost_impression_share) > 0.2 ? (
                    <div className="flex gap-2 rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                      <Lightbulb className="mt-0.5 size-3.5 shrink-0 text-amber-400" aria-hidden />
                      <span>Budget Limited: Increase spend to capture more volume.</span>
                    </div>
                  ) : null}
                  {metrics?.ads_search_rank_lost_impression_share != null &&
                  Number(metrics.ads_search_rank_lost_impression_share) > 0.2 ? (
                    <div className="flex gap-2 rounded-lg border border-sky-500/25 bg-sky-500/10 px-3 py-2 text-xs text-sky-100">
                      <Lightbulb className="mt-0.5 size-3.5 shrink-0 text-sky-400" aria-hidden />
                      <span>Rank Limited: Improve Quality Score or Bids.</span>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="mt-4 rounded-lg border border-zinc-800 bg-zinc-950/50 p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                  Prominence
                </span>
                <TrendingUp className="size-4 text-zinc-500" aria-hidden />
              </div>
              <p className="mt-2 text-2xl font-semibold tracking-tight text-zinc-50">
                {formatPct01(metrics?.ads_search_abs_top_impression_share)}
              </p>
              <p className="mt-1 text-xs text-zinc-500">Absolute top of page % (Search)</p>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="strategy" className="mt-8 flex flex-col gap-6">
          <div className={cn(midnightCard, "space-y-4")}>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold tracking-tight text-zinc-50">Strategy & narrative</h2>
                <p className="text-zinc-500 mt-1 text-sm">
                  The <span className="font-medium text-zinc-400">Strategy Insight</span> box on Overview runs the same
                  generate action. Use this tab for auction-level diagnostics.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                className="border-zinc-600 bg-transparent text-zinc-100 hover:bg-zinc-800"
                disabled={aiLoading}
                onClick={runAi}
              >
                {aiLoading ? "Generating…" : "Generate AI analysis"}
              </Button>
            </div>
            <p className="text-zinc-500 text-xs">
              Tip: keep the command center Overview open while generating so you can read the summary immediately.
            </p>
          </div>
          <CompetitiveAnalysisPanel metrics={metrics} />
        </TabsContent>

        <TabsContent value="assets" className="mt-8 grid gap-6">
          {profileSection}
          {client.services ? (
            <div className={cn(midnightCard)}>
              <h2 className="text-lg font-semibold tracking-tight text-zinc-50">Legacy services (import)</h2>
              <p className="text-zinc-500 mt-1 text-sm">Free-text field from your original CSV.</p>
              <p className="text-zinc-400 mt-4 text-sm whitespace-pre-wrap">{client.services}</p>
            </div>
          ) : null}
        </TabsContent>

        <TabsContent value="settings" className="mt-8 grid gap-6">
          <div className={cn(midnightCard, "flex flex-col gap-4")}>
            <div>
              <h2 className="text-lg font-semibold tracking-tight text-zinc-50">Tasks</h2>
              <p className="text-zinc-500 mt-1 text-sm">Open work stays on this client until archived.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-2 sm:col-span-2">
                <Label htmlFor="t-title" className="text-zinc-400">
                  Title
                </Label>
                <Input
                  id="t-title"
                  className={fieldClass}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Follow up on landing page test"
                />
              </div>
              <div className="grid gap-2 sm:col-span-2">
                <Label htmlFor="t-desc" className="text-zinc-400">
                  Description
                </Label>
                <Textarea
                  id="t-desc"
                  className={cn(fieldClass, "min-h-[88px]")}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="t-assign" className="text-zinc-400">
                  Assigned to
                </Label>
                <Input
                  id="t-assign"
                  className={fieldClass}
                  value={assignedTo}
                  onChange={(e) => setAssignedTo(e.target.value)}
                  placeholder="Alex"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="t-due" className="text-zinc-400">
                  Due date
                </Label>
                <Input
                  id="t-due"
                  className={fieldClass}
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
              </div>
            </div>
            <Button
              type="button"
              className="border-zinc-600 bg-zinc-800 text-zinc-100 hover:bg-zinc-700"
              onClick={addTask}
              disabled={adding}
            >
              {adding ? "Adding…" : "Add task"}
            </Button>
            <Separator className="bg-zinc-800" />
            <div className="flex flex-col gap-3">
              {tasks.length === 0 ? (
                <p className="text-zinc-500 text-sm">No tasks yet.</p>
              ) : (
                tasks.map((t) => (
                  <div
                    key={t.id}
                    className="border-zinc-800 bg-zinc-950/40 flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <p className="font-medium text-zinc-100">{t.title}</p>
                      {t.description ? (
                        <p className="text-zinc-400 mt-0.5 text-sm whitespace-pre-wrap">{t.description}</p>
                      ) : null}
                      <p className="text-zinc-500 mt-1 text-xs">
                        {t.assigned_to ? `${t.assigned_to} · ` : ""}
                        {t.due_date ? `Due ${t.due_date}` : "No due date"}
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="border-zinc-600 text-zinc-200 hover:bg-zinc-800"
                      onClick={() => toggleTask(t)}
                    >
                      {t.status === "completed" ? "Mark pending" : "Mark complete"}
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
