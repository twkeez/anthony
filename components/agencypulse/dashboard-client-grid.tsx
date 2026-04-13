"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { Input } from "@/components/ui/input";
import { normalizeActiveServices } from "@/lib/active-services";
import {
  getClientStatusColor,
  getClientStatusLabel,
  type ClientWithSyncSnapshot,
} from "@/lib/dashboard/client-status";
import { cn } from "@/lib/utils";
import type { ActiveServices } from "@/types/database.types";

type ServiceKey = keyof ActiveServices;

const SERVICE_FILTERS: { id: "all" | ServiceKey; label: string }[] = [
  { id: "all", label: "All" },
  { id: "ppc", label: "PPC" },
  { id: "seo", label: "SEO" },
  { id: "social", label: "Social" },
  { id: "orm", label: "ORM" },
];

const SERVICE_LABELS: Record<ServiceKey, string> = {
  ppc: "PPC",
  seo: "SEO",
  social: "Social",
  orm: "ORM",
};

function activeServiceEntries(services: ClientWithSyncSnapshot["active_services"]): { key: ServiceKey; label: string }[] {
  const s = normalizeActiveServices(services);
  return (Object.keys(SERVICE_LABELS) as ServiceKey[])
    .filter((k) => s[k])
    .map((key) => ({ key, label: SERVICE_LABELS[key] }));
}

type Props = {
  clients: ClientWithSyncSnapshot[];
  initialQuery: string;
};

export function DashboardClientGrid({ clients, initialQuery }: Props) {
  const [search, setSearch] = useState(initialQuery);
  const [serviceFilter, setServiceFilter] = useState<"all" | ServiceKey>("all");

  useEffect(() => {
    setSearch(initialQuery);
  }, [initialQuery]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return clients.filter((c) => {
      const hay = [c.business_name, c.team_member, c.account_group, c.email_domain, c.location]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (q && !hay.includes(q)) return false;
      if (serviceFilter === "all") return true;
      const s = normalizeActiveServices(c.active_services);
      return Boolean(s[serviceFilter]);
    });
  }, [clients, search, serviceFilter]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between lg:gap-6">
        <div className="relative w-full lg:max-w-md">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search clients…"
            aria-label="Search clients"
            className="border-zinc-700 bg-zinc-900/80 h-11 rounded-xl border pl-4 pr-4 text-sm font-bold lowercase text-zinc-100 placeholder:text-zinc-500 placeholder:normal-case"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-zinc-500 w-full text-[10px] font-bold uppercase tracking-widest lg:w-auto">Filter</span>
          {SERVICE_FILTERS.map(({ id, label }) => {
            const active = serviceFilter === id;
            return (
              <button
                key={String(id)}
                type="button"
                onClick={() => setServiceFilter(id)}
                className={cn(
                  "rounded-full px-3.5 py-1.5 text-xs font-bold lowercase tracking-wide transition",
                  active
                    ? "bg-fuchsia-500/20 text-fuchsia-200 ring-1 ring-fuchsia-500/40"
                    : "bg-zinc-900 text-zinc-400 ring-1 ring-zinc-800 hover:bg-zinc-800 hover:text-zinc-200",
                )}
              >
                {label.toLowerCase()}
              </button>
            );
          })}
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="text-zinc-500 py-10 text-center text-sm font-bold lowercase">No clients match.</p>
      ) : (
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((c) => {
            const pills = activeServiceEntries(c.active_services);
            const dotClass = getClientStatusColor(c);
            const statusLabel = getClientStatusLabel(c);
            return (
              <li key={c.id}>
                <Link
                  href={`/dashboard/clients/${c.id}`}
                  aria-label={`${c.business_name}. ${statusLabel}`}
                  className={cn(
                    "bg-zinc-900 border-zinc-800 hover:border-zinc-700 hover:bg-zinc-800/50 transition-all",
                    "flex min-h-[120px] cursor-pointer flex-col justify-between rounded-xl border p-5",
                  )}
                >
                  <div className="flex items-start gap-3">
                    <span
                      className={cn("mt-1.5 size-3 shrink-0 rounded-full", dotClass)}
                      aria-hidden
                      title={statusLabel}
                    />
                    <span className="min-w-0 flex-1 text-left text-lg font-medium tracking-tight text-zinc-100 line-clamp-1">
                      {c.business_name}
                    </span>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {pills.length === 0 ? (
                      <span className="text-[10px] font-semibold tracking-wider text-zinc-600 uppercase">No services</span>
                    ) : (
                      pills.map(({ key, label }) => (
                        <span
                          key={key}
                          className="rounded-md bg-zinc-800 px-2 py-1 text-[10px] font-semibold tracking-wider text-zinc-400 uppercase"
                        >
                          {label}
                        </span>
                      ))
                    )}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
