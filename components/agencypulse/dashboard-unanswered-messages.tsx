"use client";

import { ExternalLink, MessageCircleWarning } from "lucide-react";
import Link from "next/link";

import type { CommunicationActionability } from "@/lib/agency-hub/communication-alerts";
import type { UnansweredClientMessageRow } from "@/lib/agency-hub/alerts";
import {
  businessInitials,
  daysStaleTone,
  type ClientServiceRow,
  serviceTagsForClient,
  staleToneClasses,
} from "@/lib/agency-hub/dashboard-workspace";
import { cn } from "@/lib/utils";

function actionabilityLabel(a: CommunicationActionability): string {
  if (a === "likely_actionable") return "Likely needs reply";
  if (a === "possibly_informational") return "Possibly FYI";
  return "Review thread";
}

function actionabilityClasses(a: CommunicationActionability): string {
  if (a === "likely_actionable") return "border-red-500/40 bg-red-950/30 text-red-200";
  if (a === "possibly_informational") return "border-sky-500/35 bg-sky-950/25 text-sky-200";
  return "border-zinc-600 bg-zinc-900 text-zinc-300";
}

function truncate(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

export function DashboardUnansweredMessagesSection({
  rows,
  clientById,
}: {
  rows: UnansweredClientMessageRow[];
  clientById: Map<string, ClientServiceRow>;
}) {
  if (rows.length === 0) {
    return (
      <section className="rounded-2xl border border-zinc-200/90 bg-white p-6 shadow-sm shadow-black/10 sm:p-8">
        <h2 className="text-lg font-black uppercase tracking-[0.18em] text-transparent bg-gradient-to-r from-cyan-400 via-violet-500 to-fuchsia-500 bg-clip-text sm:text-xl">
          Client messages awaiting reply
        </h2>
        <p className="text-zinc-500 mt-2 max-w-2xl text-sm">
          When the last activity on a message-board thread is from a client (not your team), threads appear here,
          sorted by longest without a reply. Run <span className="font-medium text-zinc-700">Sync Basecamp</span> on
          the Communication page to refresh.
        </p>
        <p className="text-zinc-500 mt-4 text-sm">
          No open client threads on the last sync. See the{" "}
          <Link href="/dashboard/communication" className="font-medium text-violet-600 hover:underline">
            Communication
          </Link>{" "}
          screen after you run a Basecamp sync.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-zinc-200/90 bg-white p-6 shadow-sm shadow-black/10 sm:p-8">
      <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-black uppercase tracking-[0.18em] text-transparent bg-gradient-to-r from-cyan-400 via-violet-500 to-fuchsia-500 bg-clip-text sm:text-xl">
            Client messages awaiting reply
          </h2>
          <p className="text-zinc-500 mt-1 max-w-2xl text-xs leading-relaxed sm:text-sm">
            Threads where the <strong className="text-zinc-700">last Basecamp update</strong> is from a client or
            external author. Sorted by <strong className="text-zinc-700">days waiting</strong> (oldest first).
            Action hints use simple keyword heuristics — not a substitute for reading the thread.
          </p>
        </div>
      </div>

      <ul className="flex flex-col gap-3">
        {rows.map((row) => {
          const client = clientById.get(row.clientId);
          const tags = serviceTagsForClient(client);
          const tone = daysStaleTone(row.daysWaiting);
          const staleDays = row.daysWaiting;

          return (
            <li
              key={row.id}
              className="flex flex-col gap-3 rounded-xl border border-zinc-200/90 bg-zinc-50/95 px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-5"
            >
              <div className="flex min-w-0 flex-1 gap-3">
                <div
                  className="flex size-11 shrink-0 items-center justify-center rounded-full border border-zinc-200 bg-zinc-100 text-xs font-black text-zinc-700"
                  aria-hidden
                >
                  {businessInitials(row.businessName)}
                </div>
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    {tags.map((t) => (
                      <span
                        key={t}
                        className="rounded-md border border-zinc-200 bg-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-zinc-600"
                      >
                        {t}
                      </span>
                    ))}
                    <span
                      className={cn(
                        "rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                        staleToneClasses(tone),
                      )}
                    >
                      {Math.round(staleDays)}d waiting
                    </span>
                    <span
                      className={cn(
                        "rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                        actionabilityClasses(row.actionability),
                      )}
                    >
                      {actionabilityLabel(row.actionability)}
                    </span>
                  </div>
                  <p className="text-[15px] font-semibold leading-snug text-zinc-900">
                    <Link
                      href={`/dashboard/clients/${row.clientId}`}
                      className="text-violet-700 hover:text-violet-600 hover:underline"
                    >
                      {row.businessName}
                    </Link>
                    {row.authorName ? (
                      <span className="text-zinc-500 font-normal"> · {row.authorName}</span>
                    ) : null}
                  </p>
                  <p className="text-sm font-medium text-zinc-800">{row.subject}</p>
                  <p className="text-zinc-600 text-sm leading-relaxed">{truncate(row.excerpt, 320)}</p>
                  <p className="text-zinc-500 flex items-start gap-2 text-xs leading-snug">
                    <MessageCircleWarning className="mt-0.5 size-4 shrink-0 text-amber-600/90" aria-hidden />
                    <span>{row.suggestedAction}</span>
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end">
                {row.webUrl ? (
                  <a
                    href={row.webUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-1 rounded-full border border-violet-200 bg-gradient-to-r from-blue-600 via-violet-600 to-fuchsia-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:opacity-95"
                  >
                    Open in Basecamp
                    <ExternalLink className="size-3.5 opacity-90" aria-hidden />
                  </a>
                ) : (
                  <Link
                    href={`/dashboard/clients/${row.clientId}`}
                    className="inline-flex items-center justify-center rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 shadow-sm hover:bg-zinc-50"
                  >
                    Open client
                  </Link>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
