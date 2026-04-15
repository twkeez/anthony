"use client";

import { ExternalLink } from "lucide-react";

import { rankBasecampThreadsByKeywords } from "@/lib/client-goals/basecamp-thread-match";
import {
  formatMetricValue,
  isLowerIsBetterMetric,
  metricProgress01,
  readMetricValue,
  resolveMetricColumnKey,
  type MetricColumnKey,
} from "@/lib/client-goals/metric-column";
import type { CommunicationAlertsState } from "@/lib/agency-hub/communication-alerts";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ClientGoalRow, ClientMetricsRow } from "@/types/database.types";

type Props = {
  goal: ClientGoalRow;
  metrics: ClientMetricsRow | null;
  communication: CommunicationAlertsState | null;
  missionStatusLabel?: "On Track" | "At Risk" | "Lagging";
};

function GoalProgressBar({ value }: { value: number }) {
  const pct = Math.round(Math.min(100, Math.max(0, value * 100)));
  return (
    <div
      className="h-2 w-full overflow-hidden rounded-full bg-zinc-800"
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={cn(
          "h-full rounded-full transition-[width] duration-500",
          pct >= 100 ? "bg-emerald-500/90" : pct >= 70 ? "bg-sky-500/90" : "bg-amber-500/90",
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function acquisitionConversionsDown(
  goal: ClientGoalRow,
  key: MetricColumnKey | null,
  current: number | null,
  target: number,
): boolean {
  if (goal.goal_type !== "Acquisition") return false;
  if (key !== "ads_conversions") return false;
  if (current == null || !Number.isFinite(target) || target <= 0) return false;
  return current < target;
}

export function GoalCard({ goal, metrics, communication, missionStatusLabel }: Props) {
  const key = resolveMetricColumnKey(goal.metric_target_column);
  const current = key ? readMetricValue(metrics, key) : null;
  const target = Number(goal.target_value);
  const progress = key && Number.isFinite(target) && target > 0 ? metricProgress01(key, current, target) : null;

  const currentLabel =
    key != null ? formatMetricValue(key, current) : current != null ? String(current) : "—";
  const targetLabel = key != null ? formatMetricValue(key, target) : String(goal.target_value);

  const threads = rankBasecampThreadsByKeywords(communication, goal.evidence_keywords, 3);
  const showSmart =
    goal.status === "active" && acquisitionConversionsDown(goal, key, current, target);
  const kwPhrase =
    goal.evidence_keywords.length > 0
      ? goal.evidence_keywords.slice(0, 5).join(", ")
      : "your priority themes";

  return (
    <div
      className={cn(
        "rounded-xl border border-zinc-800 bg-zinc-950/50 p-4 shadow-sm",
        goal.status === "completed" && "opacity-75",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="border-zinc-600 text-zinc-200">
              {goal.goal_type}
            </Badge>
            <Badge
              variant="outline"
              className={cn(
                "border-zinc-600",
                goal.status === "active" ? "text-emerald-200/90" : "text-zinc-400",
              )}
            >
              {goal.status}
            </Badge>
            {missionStatusLabel ? (
              <Badge
                variant="outline"
                className={cn(
                  "border",
                  missionStatusLabel === "On Track"
                    ? "border-emerald-500/35 bg-emerald-500/10 text-emerald-200"
                    : missionStatusLabel === "At Risk"
                      ? "border-amber-500/35 bg-amber-500/10 text-amber-100"
                      : "border-red-500/35 bg-red-500/10 text-red-200",
                )}
              >
                {missionStatusLabel}
              </Badge>
            ) : null}
            {key ? (
              <span className="text-zinc-500 text-xs font-mono">{key}</span>
            ) : (
              <span className="text-amber-200/90 text-xs">Unknown metric: {goal.metric_target_column}</span>
            )}
          </div>
          <p className="text-zinc-100 text-sm leading-relaxed">{goal.intent_statement}</p>
        </div>
      </div>

      <div className="mt-4 space-y-2">
        <div className="flex items-baseline justify-between gap-2 text-xs text-zinc-400">
          <span>Current vs target</span>
          <span className="text-zinc-200 tabular-nums">
            <span className="font-medium text-zinc-50">{currentLabel}</span>
            {" / "}
            <span>{targetLabel}</span>
            {key && isLowerIsBetterMetric(key) ? (
              <span className="text-zinc-500"> (lower is better)</span>
            ) : null}
          </span>
        </div>
        {progress != null ? (
          <GoalProgressBar value={progress} />
        ) : (
          <p className="text-zinc-500 text-xs">Sync metrics to populate this goal&apos;s metric.</p>
        )}
      </div>

      {showSmart ? (
        <div className="mt-4 rounded-lg border border-sky-500/25 bg-sky-950/25 px-3 py-2">
          <p className="text-sky-100/95 text-xs leading-relaxed">
            <span className="font-semibold text-sky-200">Anthony suggests:</span> Review Google Ads bidding strategy
            for {kwPhrase}.
          </p>
        </div>
      ) : null}

      {goal.ai_analysis?.trim() ? (
        <p className="text-zinc-400 mt-3 border-t border-zinc-800/80 pt-3 text-xs leading-relaxed whitespace-pre-wrap">
          {goal.ai_analysis.trim()}
        </p>
      ) : null}

      <div className="mt-4 border-t border-zinc-800/80 pt-3">
        <p className="text-zinc-500 mb-2 text-xs font-medium uppercase tracking-wide">Evidence of Work</p>
        {threads.length === 0 ? (
          <p className="text-zinc-500 text-xs">No threads matched your evidence keywords yet.</p>
        ) : (
          <ul className="space-y-2">
            {threads.map((t, i) => (
              <li key={`${t.subject}-${i}`} className="text-xs">
                <div className="flex items-start gap-2">
                  <span className="text-zinc-500 shrink-0">{t.score > 0 ? `${t.score}×` : "—"}</span>
                  <div className="min-w-0">
                    {t.webUrl ? (
                      <a
                        href={t.webUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 font-medium text-sky-300 hover:text-sky-200"
                      >
                        <span className="truncate">{t.subject}</span>
                        <ExternalLink className="size-3 shrink-0 opacity-70" aria-hidden />
                      </a>
                    ) : (
                      <span className="font-medium text-zinc-200">{t.subject}</span>
                    )}
                    {t.excerpt ? (
                      <p className="text-zinc-500 mt-0.5 line-clamp-2">{t.excerpt}</p>
                    ) : null}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
