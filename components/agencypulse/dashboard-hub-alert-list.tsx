"use client";

import Link from "next/link";
import { ChevronDown, ChevronUp, Clock, MessageCircle } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

import type { HubAlertActionBadge, HubAlertItem } from "@/lib/agency-hub/alerts";
import {
  businessInitials,
  daysStaleForHubRow,
  daysStaleTone,
  type ClientServiceRow,
  serviceTagsForClient,
  staleToneClasses,
} from "@/lib/agency-hub/dashboard-workspace";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const sectionShell =
  "rounded-2xl border border-zinc-200/90 bg-white p-6 shadow-sm shadow-black/10 sm:p-8";

const INITIAL = 5;

function ClientAvatar({ name }: { name: string }) {
  return (
    <div
      className="flex size-11 shrink-0 items-center justify-center rounded-full border border-zinc-200 bg-zinc-100 text-xs font-black text-zinc-700"
      aria-hidden
    >
      {businessInitials(name)}
    </div>
  );
}

function ServiceTagPills({ tags }: { tags: string[] }) {
  if (tags.length === 0) return <span className="text-[10px] font-medium uppercase tracking-wide text-zinc-400">—</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {tags.map((t) => (
        <span
          key={t}
          className="rounded-md border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-zinc-600"
        >
          {t}
        </span>
      ))}
    </div>
  );
}

function DaysStaleBadge({ days }: { days: number | null }) {
  if (days == null || !Number.isFinite(days)) {
    return (
      <span className="rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-zinc-500">
        Days stale —
      </span>
    );
  }
  const tone = daysStaleTone(days);
  return (
    <span
      className={cn(
        "rounded-md border px-2 py-1 text-[10px] font-bold uppercase tracking-wide",
        staleToneClasses(tone),
      )}
    >
      Days stale {Math.round(days)}d
    </span>
  );
}

export function DashboardHubAlertListSection({
  title,
  subtitle,
  rows,
  clientById,
  emptyStateText,
  headerAction,
}: {
  title: string;
  subtitle: string;
  rows: HubAlertItem[];
  clientById: Map<string, ClientServiceRow>;
  emptyStateText: string;
  /** e.g. “Refresh Inbox” for communication sync */
  headerAction?: ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const visible = useMemo(
    () => (expanded ? rows : rows.slice(0, INITIAL)),
    [expanded, rows],
  );
  const canToggle = rows.length > INITIAL;

  return (
    <section className={sectionShell}>
      <div className="mb-5 flex flex-col gap-2 sm:mb-6 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-black uppercase tracking-[0.18em] text-transparent bg-gradient-to-r from-cyan-400 via-violet-500 to-fuchsia-500 bg-clip-text sm:text-xl">
            {title}
          </h2>
          <p className="mt-1 max-w-xl text-xs leading-relaxed text-zinc-500">{subtitle}</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {headerAction}
          {canToggle ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setExpanded((e) => !e)}
              className="shrink-0 border-zinc-300 bg-zinc-50 text-zinc-800 hover:bg-white"
            >
              {expanded ? (
                <>
                  <ChevronUp className="mr-1.5 size-4" aria-hidden />
                  Show less
                </>
              ) : (
                <>
                  <ChevronDown className="mr-1.5 size-4" aria-hidden />
                  View all ({rows.length})
                </>
              )}
            </Button>
          ) : null}
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm leading-relaxed text-zinc-500">{emptyStateText}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {visible.map((row) => {
            const client = clientById.get(row.clientId);
            const tags = serviceTagsForClient(client);
            const staleDays = daysStaleForHubRow(row);
            const CommIcon: LucideIcon | null =
              row.communicationActionKind === "needs_reply"
                ? MessageCircle
                : row.communicationActionKind === "stale"
                  ? Clock
                  : null;

            return (
              <li key={row.id}>
                <div className="flex min-h-[76px] flex-col gap-3 rounded-xl border border-zinc-200/80 bg-zinc-50/95 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <ClientAvatar name={row.businessName} />
                    <div className="flex min-w-0 flex-1 flex-col gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <ServiceTagPills tags={tags} />
                        <DaysStaleBadge days={staleDays} />
                      </div>
                      {row.actionBadges && row.actionBadges.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {row.actionBadges.map((b: HubAlertActionBadge) => (
                            <span
                              key={b.text}
                              className={cn(
                                "rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                                b.variant === "danger"
                                  ? "border-[#ef4444]/35 bg-[#ef4444]/10 text-[#fecaca]"
                                  : "border-[#f59e0b]/35 bg-[#f59e0b]/10 text-[#fde68a]",
                              )}
                            >
                              {b.text}
                            </span>
                          ))}
                        </div>
                      ) : null}
                      <div className="flex items-start gap-2">
                        {CommIcon ? (
                          <CommIcon
                            className={cn(
                              "mt-0.5 size-4 shrink-0",
                              row.communicationActionKind === "needs_reply" ? "text-[#ef4444]" : "text-[#f59e0b]",
                            )}
                            aria-hidden
                          />
                        ) : null}
                        <span
                          className={cn(
                            "text-[15px] font-medium leading-snug",
                            row.severity === "red"
                              ? "text-[#b91c1c]"
                              : row.severity === "yellow"
                                ? "text-[#b45309]"
                                : "text-zinc-800",
                          )}
                        >
                          {row.label}
                        </span>
                        {row.communicationLastAuthor ? (
                          <p className="text-zinc-500 mt-1 text-xs">
                            Last post:{" "}
                            <span className="font-semibold text-zinc-700">{row.communicationLastAuthor}</span>
                            {row.communicationLastAuthorIsInternal ? (
                              <span className="ml-2 inline-flex items-center rounded-md border border-violet-400/45 bg-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-violet-600 to-sky-500">
                                Agency
                              </span>
                            ) : null}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </div>
                  <Link
                    href={row.href}
                    className="inline-flex shrink-0 items-center justify-center rounded-full border border-violet-200 bg-gradient-to-r from-blue-600 via-violet-600 to-fuchsia-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:opacity-95"
                  >
                    Open
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
