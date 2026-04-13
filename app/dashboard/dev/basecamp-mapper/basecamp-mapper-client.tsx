"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import type { BasecampProjectOption, ClientBasecampMapperRow } from "@/lib/dev/basecamp-project-match";
import { cn } from "@/lib/utils";

import {
  type BasecampMapperClientRow,
  fetchBasecampProjectsForMapperAction,
  saveBasecampMapperMatchesAction,
} from "./actions";

const card = "rounded-xl border border-zinc-800 bg-zinc-900/90 shadow-sm";
const th = "text-left text-xs font-semibold uppercase tracking-wide text-zinc-500";
const td = "border-t border-zinc-800/90 px-4 py-3 text-sm text-zinc-200";

function resolveDefaultSelection(
  client: ClientBasecampMapperRow,
  projects: BasecampProjectOption[],
  suggestedProjectId: string | null,
): string {
  if (suggestedProjectId && projects.some((p) => p.id === suggestedProjectId)) {
    return suggestedProjectId;
  }
  const cur = (client.basecamp_project_id ?? "").trim();
  if (cur && projects.some((p) => p.id === cur)) {
    return cur;
  }
  return "";
}

function rowStatus(
  selection: string,
  suggestedProjectId: string | null | undefined,
  currentStored: string | null,
): string {
  if (selection === "") return "None";
  const cur = (currentStored ?? "").trim();
  if (suggestedProjectId && selection === suggestedProjectId) return "Auto-matched";
  if (cur && selection === cur) return "Unchanged";
  return "Manual";
}

export function BasecampMapperClient({ initialClients }: { initialClients: ClientBasecampMapperRow[] }) {
  const [clients, setClients] = useState<BasecampMapperClientRow[]>(() =>
    initialClients.map((c) => ({ ...c, suggestedProjectId: null })),
  );
  const [projects, setProjects] = useState<BasecampProjectOption[]>([]);
  const [selections, setSelections] = useState<Record<string, string>>(() => {
    const m: Record<string, string> = {};
    for (const c of initialClients) {
      m[c.id] = (c.basecamp_project_id ?? "").trim();
    }
    return m;
  });
  const [hasFetchedBasecamp, setHasFetchedBasecamp] = useState(false);
  const [fetchPending, startFetch] = useTransition();
  const [savePending, startSave] = useTransition();

  const applyFetchResult = useCallback((nextClients: BasecampMapperClientRow[], nextProjects: BasecampProjectOption[]) => {
    setClients(nextClients);
    setProjects(nextProjects);
    const sel: Record<string, string> = {};
    for (const c of nextClients) {
      sel[c.id] = resolveDefaultSelection(c, nextProjects, c.suggestedProjectId);
    }
    setSelections(sel);
    setHasFetchedBasecamp(true);
  }, []);

  const handleFetchFromBasecamp = () => {
    startFetch(async () => {
      try {
        const data = await fetchBasecampProjectsForMapperAction();
        applyFetchResult(data.clients, data.projects);
        toast.success(`Loaded ${data.projects.length} Basecamp projects for ${data.clients.length} clients.`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to load Basecamp projects.");
      }
    });
  };

  const handleSaveAll = () => {
    startSave(async () => {
      try {
        const rows = clients.map((c) => ({
          clientId: c.id,
          basecampProjectId: selections[c.id] ?? "",
        }));
        const { updated } = await saveBasecampMapperMatchesAction(rows);
        toast.success(`Updated ${updated} client(s).`);
        setClients((prev) =>
          prev.map((c) => ({
            ...c,
            basecamp_project_id: (selections[c.id] ?? "").trim() || null,
            suggestedProjectId: c.suggestedProjectId,
          })),
        );
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Save failed.");
      }
    });
  };

  const selectOptions = useMemo(() => {
    const head: BasecampProjectOption[] = [{ id: "", name: "— None —" }];
    return [...head, ...projects];
  }, [projects]);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
      <header>
        <p className="text-zinc-500 text-xs font-semibold uppercase tracking-widest">Developer tools</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-50">Basecamp 2 project mapper</h1>
        <p className="text-zinc-500 mt-2 max-w-2xl text-sm">
          Loads projects from{" "}
          <code className="text-zinc-400">/api/v1/projects.json</code> using HTTP Basic Auth (env credentials),
          suggests matches to Supabase clients by name, then saves project ids to{" "}
          <code className="text-zinc-400">clients.basecamp_project_id</code>.
        </p>
      </header>

      <div className="flex flex-wrap gap-3">
        <Button
          type="button"
          className="border-zinc-600 bg-zinc-800 text-zinc-100 hover:bg-zinc-700"
          disabled={fetchPending}
          onClick={handleFetchFromBasecamp}
        >
          {fetchPending ? "Fetching…" : "Fetch from Basecamp"}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="border-zinc-600 bg-transparent text-zinc-200 hover:bg-zinc-800"
          disabled={!hasFetchedBasecamp || savePending}
          onClick={handleSaveAll}
        >
          {savePending ? "Saving…" : "Save all"}
        </Button>
      </div>

      <div className={cn("overflow-hidden", card)}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] border-collapse text-left">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-950/80">
                <th className={cn(th, "px-4 py-3")}>Supabase client</th>
                <th className={cn(th, "px-4 py-3")}>Current Basecamp project id</th>
                <th className={cn(th, "px-4 py-3")}>Suggested match (dropdown)</th>
                <th className={cn(th, "px-4 py-3 w-36")}>Status</th>
              </tr>
            </thead>
            <tbody>
              {clients.length === 0 ? (
                <tr>
                  <td colSpan={4} className={cn(td, "text-zinc-500")}>
                    No clients in the database.
                  </td>
                </tr>
              ) : (
                clients.map((c) => {
                  const sel = selections[c.id] ?? "";
                  const status = hasFetchedBasecamp
                    ? rowStatus(sel, c.suggestedProjectId, c.basecamp_project_id)
                    : "—";
                  return (
                    <tr key={c.id} className="hover:bg-zinc-950/40">
                      <td className={td}>
                        <div className="font-medium text-zinc-100">{c.business_name || "—"}</div>
                        {c.website ? (
                          <div className="text-zinc-500 mt-0.5 truncate text-xs" title={c.website}>
                            {c.website}
                          </div>
                        ) : null}
                      </td>
                      <td className={cn(td, "font-mono text-xs text-zinc-400")}>
                        {(c.basecamp_project_id ?? "").trim() || "—"}
                      </td>
                      <td className={td}>
                        {!hasFetchedBasecamp ? (
                          <span className="text-zinc-500 text-xs">Fetch from Basecamp first</span>
                        ) : (
                          <select
                            className="border-zinc-700 bg-zinc-950 text-zinc-100 w-full max-w-md rounded-md border px-2 py-1.5 text-sm"
                            value={sel}
                            onChange={(e) =>
                              setSelections((prev) => ({
                                ...prev,
                                [c.id]: e.target.value,
                              }))
                            }
                          >
                            {selectOptions.map((p) => (
                              <option key={p.id || "none"} value={p.id}>
                                {p.id ? `${p.name} (${p.id})` : p.name}
                              </option>
                            ))}
                          </select>
                        )}
                      </td>
                      <td className={cn(td, "text-xs text-zinc-400")}>{status}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {!hasFetchedBasecamp ? (
        <p className="text-zinc-500 text-sm">
          Click <strong className="text-zinc-300">Fetch from Basecamp</strong> to load projects and apply auto-matches.
        </p>
      ) : null}
    </div>
  );
}
