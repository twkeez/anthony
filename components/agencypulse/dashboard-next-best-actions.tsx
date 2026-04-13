"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";

import type { NextBestAction } from "@/lib/agency-hub/dashboard-workspace";
import { businessInitials } from "@/lib/agency-hub/dashboard-workspace";
import { cn } from "@/lib/utils";

const shell =
  "rounded-2xl border border-zinc-200/90 bg-white p-6 shadow-sm shadow-black/10 sm:p-8";

export function DashboardNextBestActions({ items }: { items: NextBestAction[] }) {
  return (
    <section className={shell}>
      <div className="mb-5 flex flex-col gap-1 sm:mb-6">
        <h2 className="text-lg font-black uppercase tracking-[0.18em] text-transparent bg-gradient-to-r from-cyan-400 via-violet-500 to-fuchsia-500 bg-clip-text sm:text-xl">
          Next best actions
        </h2>
        <p className="text-xs leading-relaxed text-zinc-500">
          Triage queue: needs reply → disapproved ads → overdue tasks → stale accounts over 30 days.
        </p>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-zinc-500">Nothing urgent in the top slots — run Sync metrics to refresh.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <li key={item.id}>
              <Link
                href={item.href}
                className="group flex min-h-[72px] items-center gap-4 rounded-xl border border-zinc-200/80 bg-zinc-50/90 px-4 py-3 transition hover:border-violet-300/60 hover:bg-white sm:px-5 sm:py-4"
              >
                <div
                  className={cn(
                    "flex size-11 shrink-0 items-center justify-center rounded-full border border-zinc-200 bg-white text-xs font-black text-zinc-700",
                  )}
                  aria-hidden
                >
                  {businessInitials(item.businessName)}
                </div>
                <div
                  className={cn(
                    "size-2.5 shrink-0 rounded-full",
                    item.tier <= 2 ? "bg-[#ef4444]" : "bg-[#f59e0b]",
                  )}
                  title={`Priority tier ${item.tier}`}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold uppercase tracking-wide text-violet-600">{item.title}</p>
                  <p className="mt-0.5 text-sm font-medium leading-snug text-zinc-800">{item.subtitle}</p>
                </div>
                <ChevronRight className="size-5 shrink-0 text-zinc-400 transition group-hover:text-violet-500" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
