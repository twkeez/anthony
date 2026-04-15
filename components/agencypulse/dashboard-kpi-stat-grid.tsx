"use client";

import { AlertTriangle, Clock, Gauge, MessageCircle, MessagesSquare, Megaphone, Radio } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import type { DashboardKpis } from "@/lib/agency-hub/dashboard-workspace";
import { cn } from "@/lib/utils";

const cardOuter =
  "rounded-2xl border border-zinc-200/90 bg-white p-5 shadow-sm shadow-black/10 sm:p-6";

function StatCard({
  label,
  value,
  icon: Icon,
  accentClass,
}: {
  label: string;
  value: number;
  icon: LucideIcon;
  accentClass: string;
}) {
  return (
    <div className={cn(cardOuter, "flex flex-col gap-3")}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-zinc-500">{label}</p>
        <div
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-xl border border-zinc-200/80 bg-zinc-50",
            accentClass,
          )}
        >
          <Icon className="size-5" aria-hidden />
        </div>
      </div>
      <p className="text-3xl font-black tabular-nums tracking-tight text-zinc-900 sm:text-4xl">{value}</p>
    </div>
  );
}

export function DashboardKpiStatGrid({ kpis, loading }: { kpis: DashboardKpis | null; loading: boolean }) {
  if (loading || !kpis) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-7">
        {Array.from({ length: 7 }).map((_, i) => (
          <div
            key={i}
            className={cn(cardOuter, "h-[132px] animate-pulse bg-zinc-100")}
            aria-hidden
          />
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-7">
      <StatCard
        label="Overdue tasks"
        value={kpis.overdueTasksTotal}
        icon={Clock}
        accentClass="text-amber-600"
      />
      <StatCard
        label="Needs reply"
        value={kpis.needsReplyCount}
        icon={MessageCircle}
        accentClass="text-[#ef4444]"
      />
      <StatCard
        label="Client threads open"
        value={kpis.clientMessageThreadsOpen}
        icon={MessagesSquare}
        accentClass="text-rose-600"
      />
      <StatCard
        label="Stale accounts"
        value={kpis.staleAccountsCount}
        icon={AlertTriangle}
        accentClass="text-[#f59e0b]"
      />
      <StatCard
        label="Ad alerts"
        value={kpis.adAlertsPriorityCount}
        icon={Megaphone}
        accentClass="text-violet-600"
      />
      <StatCard
        label="GA4 flags"
        value={kpis.ga4AlertsCount}
        icon={Radio}
        accentClass="text-sky-600"
      />
      <StatCard
        label="Lighthouse issues"
        value={kpis.lighthouseIssueCount}
        icon={Gauge}
        accentClass="text-fuchsia-600"
      />
    </div>
  );
}
