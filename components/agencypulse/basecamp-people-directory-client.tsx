"use client";

import { BookUser, ClipboardCopy, Loader2, RefreshCw } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

import type { BasecampPeopleDirectoryRow } from "@/lib/basecamp/people-directory-types";

const glass = "rounded-xl border border-zinc-800 bg-zinc-900/90 shadow-sm";

function toCsv(rows: BasecampPeopleDirectoryRow[]): string {
  const header = "id,email,name";
  const lines = rows.map((r) => {
    const name = r.name.includes(",") || r.name.includes('"') ? `"${r.name.replace(/"/g, '""')}"` : r.name;
    const email = r.email ?? "";
    return `${r.id},${email},${name}`;
  });
  return [header, ...lines].join("\n");
}

export function BasecampPeopleDirectoryClient() {
  const [people, setPeople] = useState<BasecampPeopleDirectoryRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/dev/basecamp-people");
      const data = (await res.json()) as { people?: BasecampPeopleDirectoryRow[]; error?: string };
      if (!res.ok) {
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      setPeople(data.people ?? []);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Load failed.";
      setError(msg);
      setPeople(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const filtered = useMemo(() => {
    if (!people) return [];
    const q = query.trim().toLowerCase();
    if (!q) return people;
    return people.filter((p) => {
      if (p.id.includes(q)) return true;
      if (p.name.toLowerCase().includes(q)) return true;
      if (p.email && p.email.includes(q)) return true;
      return false;
    });
  }, [people, query]);

  async function copyCsv() {
    if (!people?.length) return;
    const csv = toCsv(filtered.length < people.length ? filtered : people);
    try {
      await navigator.clipboard.writeText(csv);
      toast.success(
        filtered.length < people.length
          ? `Copied ${filtered.length} filtered rows as CSV.`
          : `Copied ${people.length} rows as CSV.`,
      );
    } catch {
      toast.error("Could not copy to clipboard.");
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-zinc-50">
            <BookUser className="size-7 text-sky-400/90" aria-hidden />
            Basecamp people
          </h1>
          <p className="text-zinc-500 mt-1 max-w-2xl text-sm">
            Everyone returned by{" "}
            <code className="rounded bg-zinc-800 px-1 font-mono text-[11px] text-zinc-300">GET /api/v1/people.json</code>{" "}
            for <span className="font-mono text-[11px] text-zinc-400">BASECAMP_ACCOUNT_ID</span>. Some accounts omit
            email for certain people — use Basecamp id + display name for{" "}
            <span className="text-zinc-400">Internal contacts</span> when needed. In production this page is off unless{" "}
            <code className="rounded bg-zinc-800 px-1 font-mono text-[11px] text-zinc-300">ENABLE_BASECAMP_DIRECTORY</code>{" "}
            or <code className="rounded bg-zinc-800 px-1 font-mono text-[11px] text-zinc-300">ENABLE_BASECAMP_MAPPER</code>{" "}
            is set.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={loading || !people?.length}
            onClick={() => void copyCsv()}
            className="border-zinc-700 text-zinc-200"
          >
            <ClipboardCopy className="mr-2 size-4" aria-hidden />
            Copy CSV
          </Button>
          <Button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="bg-gradient-to-r from-sky-600 to-violet-600 text-white hover:opacity-95 disabled:opacity-60"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
                Loading…
              </>
            ) : (
              <>
                <RefreshCw className="mr-2 size-4" aria-hidden />
                {people ? "Refresh" : "Load from Basecamp"}
              </>
            )}
          </Button>
        </div>
      </div>

      {error ? (
        <p className="text-sm text-red-400" role="alert">
          {error}
        </p>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Input
          placeholder="Filter by name, email, or id…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          disabled={!people?.length}
          className="max-w-md border-zinc-700 bg-zinc-950/80 text-zinc-100 placeholder:text-zinc-600"
        />
        {people != null ? (
          <p className="text-zinc-500 text-sm tabular-nums">
            Showing <span className="text-zinc-300">{filtered.length}</span>
            {query.trim() ? ` of ${people.length}` : null}
          </p>
        ) : null}
      </div>

      <div className={cn("overflow-hidden", glass)}>
        <Table>
          <TableHeader>
            <TableRow className="border-zinc-800 hover:bg-transparent">
              <TableHead className="w-36 font-mono text-[11px] text-zinc-500">Person id</TableHead>
              <TableHead className="text-zinc-500">Email</TableHead>
              <TableHead className="text-zinc-500">Name</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!people ? (
              <TableRow className="border-zinc-800">
                <TableCell colSpan={3} className="text-zinc-500 py-10 text-center text-sm">
                  Click <span className="text-zinc-400">Load from Basecamp</span> to fetch the directory.
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow className="border-zinc-800">
                <TableCell colSpan={3} className="text-zinc-500 py-10 text-center text-sm">
                  {people.length === 0 ? "No people returned." : "No rows match your filter."}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((p) => (
                <TableRow key={p.id} className="border-zinc-800 hover:bg-zinc-950/50">
                  <TableCell className="font-mono text-xs text-amber-200/90">{p.id}</TableCell>
                  <TableCell className="font-mono text-xs text-zinc-300">{p.email ?? "—"}</TableCell>
                  <TableCell className="text-sm text-zinc-200">{p.name}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
