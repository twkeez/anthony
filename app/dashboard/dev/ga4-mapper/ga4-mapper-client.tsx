"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  type ClientMapperRow,
  normalizeGa4StoredId,
  type Ga4PropertyOption,
} from "@/lib/dev/ga4-property-match";
import { cn } from "@/lib/utils";

import {
  type Ga4MapperClientRow,
  fetchGa4PropertiesForMapperAction,
  saveGa4MapperMatchesAction,
} from "./actions";

const card = "rounded-xl border border-zinc-800 bg-zinc-900/90 shadow-sm";
const th = "text-left text-xs font-semibold uppercase tracking-wide text-zinc-500";
const td = "border-t border-zinc-800/90 px-4 py-3 text-sm text-zinc-200";

function resolveDefaultSelection(
  client: ClientMapperRow,
  properties: Ga4PropertyOption[],
  suggestedNumericId: string | null,
): string {
  if (suggestedNumericId && properties.some((p) => p.numericId === suggestedNumericId)) {
    return suggestedNumericId;
  }
  const cur = normalizeGa4StoredId(client.ga4_property_id);
  if (cur && properties.some((p) => p.numericId === cur)) {
    return cur;
  }
  return "";
}

function rowStatus(
  clientId: string,
  selection: string,
  suggestedNumericId: string | null | undefined,
  currentStored: string | null,
): string {
  if (selection === "") return "None";
  const cur = normalizeGa4StoredId(currentStored);
  if (suggestedNumericId && selection === suggestedNumericId) return "Auto-matched";
  if (cur && selection === cur) return "Unchanged";
  return "Manual";
}

export function Ga4MapperClient({ initialClients }: { initialClients: ClientMapperRow[] }) {
  const [clients, setClients] = useState<Ga4MapperClientRow[]>(() =>
    initialClients.map((c) => ({ ...c, suggestedNumericId: null })),
  );
  const [properties, setProperties] = useState<Ga4PropertyOption[]>([]);
  const [selections, setSelections] = useState<Record<string, string>>(() => {
    const m: Record<string, string> = {};
    for (const c of initialClients) {
      m[c.id] = normalizeGa4StoredId(c.ga4_property_id);
    }
    return m;
  });
  const [hasFetchedGoogle, setHasFetchedGoogle] = useState(false);
  const [fetchPending, startFetch] = useTransition();
  const [savePending, startSave] = useTransition();

  const applyFetchResult = useCallback((nextClients: Ga4MapperClientRow[], nextProps: Ga4PropertyOption[]) => {
    setClients(nextClients);
    setProperties(nextProps);
    const sel: Record<string, string> = {};
    for (const c of nextClients) {
      sel[c.id] = resolveDefaultSelection(c, nextProps, c.suggestedNumericId);
    }
    setSelections(sel);
    setHasFetchedGoogle(true);
  }, []);

  const handleFetchFromGoogle = () => {
    startFetch(async () => {
      try {
        const data = await fetchGa4PropertiesForMapperAction();
        applyFetchResult(data.clients, data.properties);
        toast.success(`Loaded ${data.properties.length} GA4 properties for ${data.clients.length} clients.`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to load GA4 properties.");
      }
    });
  };

  const handleSaveAll = () => {
    startSave(async () => {
      try {
        const rows = clients.map((c) => ({
          clientId: c.id,
          ga4PropertyId: selections[c.id] ?? "",
        }));
        const { updated } = await saveGa4MapperMatchesAction(rows);
        toast.success(`Updated ${updated} client(s).`);
        setClients((prev) =>
          prev.map((c) => ({
            ...c,
            ga4_property_id: selections[c.id] ? selections[c.id] : null,
            suggestedNumericId: c.suggestedNumericId,
          })),
        );
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Save failed.");
      }
    });
  };

  const selectOptions = useMemo(() => {
    const head = [{ numericId: "", displayName: "— None —", resourceName: "" }];
    return [...head, ...properties];
  }, [properties]);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
      <header>
        <p className="text-zinc-500 text-xs font-semibold uppercase tracking-widest">Developer tools</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-50">GA4 property mapper</h1>
        <p className="text-zinc-500 mt-2 max-w-2xl text-sm">
          Lists GA4 properties from <code className="text-zinc-400">accountSummaries.list</code> using the agency
          Google connection, suggests matches to Supabase clients, then saves numeric property IDs to{" "}
          <code className="text-zinc-400">clients.ga4_property_id</code>.
        </p>
      </header>

      <div className="flex flex-wrap gap-3">
        <Button
          type="button"
          className="border-zinc-600 bg-zinc-800 text-zinc-100 hover:bg-zinc-700"
          disabled={fetchPending}
          onClick={handleFetchFromGoogle}
        >
          {fetchPending ? "Fetching…" : "Fetch from Google"}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="border-zinc-600 bg-transparent text-zinc-200 hover:bg-zinc-800"
          disabled={!hasFetchedGoogle || savePending}
          onClick={handleSaveAll}
        >
          {savePending ? "Saving…" : "Save all matches"}
        </Button>
      </div>

      <div className={cn("overflow-hidden", card)}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse text-left">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-950/80">
                <th className={cn(th, "px-4 py-3")}>Supabase client</th>
                <th className={cn(th, "px-4 py-3")}>Current GA4 ID</th>
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
                  const status = hasFetchedGoogle
                    ? rowStatus(c.id, sel, c.suggestedNumericId, c.ga4_property_id)
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
                        {normalizeGa4StoredId(c.ga4_property_id) || "—"}
                      </td>
                      <td className={td}>
                        {!hasFetchedGoogle ? (
                          <span className="text-zinc-500 text-xs">Fetch from Google first</span>
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
                              <option key={p.numericId || "none"} value={p.numericId}>
                                {p.numericId
                                  ? `${p.displayName} (${p.numericId})`
                                  : p.displayName}
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

      {!hasFetchedGoogle ? (
        <p className="text-zinc-500 text-sm">
          Click <strong className="text-zinc-300">Fetch from Google</strong> to load properties and apply auto-matches.
        </p>
      ) : null}
    </div>
  );
}
