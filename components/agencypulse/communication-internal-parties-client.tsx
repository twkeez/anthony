"use client";

import { Loader2, Pencil, Plus, UserCheck, UserMinus } from "lucide-react";
import Link from "next/link";
import { useCallback, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { COMMUNICATION_MESSAGE_BOARD_ROLLING_DAYS } from "@/lib/agency-hub/communication-alerts";
import type { CommunicationInternalPartyRow } from "@/lib/communication/internal-parties-types";
import { cn } from "@/lib/utils";

const fieldClass = "border-zinc-700 bg-zinc-950/80 text-zinc-100 placeholder:text-zinc-600";

type FormState = {
  email: string;
  basecamp_id: string;
  display_name: string;
  note: string;
  is_active: boolean;
};

const emptyForm: FormState = {
  email: "",
  basecamp_id: "",
  display_name: "",
  note: "",
  is_active: true,
};

function formFromRow(r: CommunicationInternalPartyRow): FormState {
  return {
    email: r.email ?? "",
    basecamp_id: r.basecamp_id ?? "",
    display_name: r.display_name ?? "",
    note: r.note ?? "",
    is_active: r.is_active,
  };
}

type Props = {
  initialParties: CommunicationInternalPartyRow[];
};

export function CommunicationInternalPartiesClient({ initialParties }: Props) {
  const [rows, setRows] = useState<CommunicationInternalPartyRow[]>(initialParties);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [showInactive, setShowInactive] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/communication-internal-parties");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not load list.");
      setRows((data.parties as CommunicationInternalPartyRow[]) ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed.");
    } finally {
      setLoading(false);
    }
  }, []);

  const visibleRows = showInactive ? rows : rows.filter((r) => r.is_active);

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setDialogOpen(true);
    setError(null);
  }

  function openEdit(r: CommunicationInternalPartyRow) {
    setEditingId(r.id);
    setForm(formFromRow(r));
    setDialogOpen(true);
    setError(null);
  }

  async function saveDialog() {
    const email = form.email.trim().toLowerCase();
    const basecamp_id = form.basecamp_id.trim() || null;
    const display_name = form.display_name.trim() || null;
    if (!email && !basecamp_id && !display_name) {
      setError("Enter at least one of email, Basecamp person id, or display name.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      if (editingId) {
        const res = await fetch(`/api/communication-internal-parties/${editingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: email || null,
            basecamp_id,
            display_name,
            note: form.note.trim() || null,
            is_active: form.is_active,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Save failed.");
        const next = data.party as CommunicationInternalPartyRow;
        setRows((prev) => prev.map((x) => (x.id === next.id ? next : x)));
      } else {
        const res = await fetch("/api/communication-internal-parties", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: email || null,
            basecamp_id,
            display_name,
            note: form.note.trim() || null,
            is_active: form.is_active,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Create failed.");
        const next = data.party as CommunicationInternalPartyRow;
        setRows((prev) => [...prev, next]);
      }
      setDialogOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  async function deactivate(id: string) {
    if (!confirm("Deactivate this entry? It will no longer count as an internal author until re-enabled.")) {
      return;
    }
    setError(null);
    try {
      const res = await fetch(`/api/communication-internal-parties/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Deactivate failed.");
      const next = data.party as CommunicationInternalPartyRow;
      setRows((prev) => prev.map((x) => (x.id === next.id ? next : x)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Deactivate failed.");
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-zinc-50">
            <UserCheck className="size-7 text-violet-400/90" aria-hidden />
            Internal contacts
          </h1>
          <p className="text-zinc-500 mt-1 max-w-2xl text-sm">
            People listed here are treated like staff when classifying Basecamp message-board{" "}
            <span className="font-mono text-[11px] text-zinc-400">last_updater</span>: if they posted last, we assume
            the agency side already replied. Use for contractors and partners who are not on the{" "}
            <Link href="/dashboard/settings/team" className="text-sky-400/90 hover:underline">
              Team
            </Link>{" "}
            roster. Sync uses a rolling {COMMUNICATION_MESSAGE_BOARD_ROLLING_DAYS}-day window of topics for last message
            and inbox threads.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={loading}
            onClick={() => void refresh()}
            className="border-zinc-700 text-zinc-200"
          >
            {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : "Refresh"}
          </Button>
          <Button
            type="button"
            onClick={openCreate}
            className="bg-gradient-to-r from-violet-600 to-sky-600 text-white hover:opacity-95"
          >
            <Plus className="mr-2 size-4" aria-hidden />
            Add
          </Button>
        </div>
      </div>

      {error ? (
        <p className="text-sm text-red-400" role="alert">
          {error}
        </p>
      ) : null}

      <div className="flex items-center gap-2">
        <Switch id="show-inactive-ip" checked={showInactive} onCheckedChange={setShowInactive} />
        <Label htmlFor="show-inactive-ip" className="text-sm text-zinc-400">
          Show inactive
        </Label>
      </div>

      <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/90 shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="border-zinc-800 hover:bg-transparent">
              <TableHead className="text-zinc-500">Display name</TableHead>
              <TableHead className="text-zinc-500">Email</TableHead>
              <TableHead className="text-zinc-500">Basecamp id</TableHead>
              <TableHead className="text-zinc-500">Note</TableHead>
              <TableHead className="w-32 text-zinc-500">Status</TableHead>
              <TableHead className="w-28 text-right text-zinc-500"> </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleRows.length === 0 ? (
              <TableRow className="border-zinc-800">
                <TableCell colSpan={6} className="text-zinc-500 py-10 text-center text-sm">
                  No entries yet. Add an email, Basecamp person id, and/or display name (case-insensitive name match
                  when Basecamp omits email).
                </TableCell>
              </TableRow>
            ) : (
              visibleRows.map((r) => (
                <TableRow key={r.id} className="border-zinc-800 hover:bg-zinc-950/50">
                  <TableCell className="font-medium text-zinc-200">{r.display_name ?? "—"}</TableCell>
                  <TableCell className="font-mono text-xs text-zinc-400">{r.email ?? "—"}</TableCell>
                  <TableCell className="font-mono text-xs text-zinc-400">{r.basecamp_id ?? "—"}</TableCell>
                  <TableCell className="max-w-[200px] truncate text-xs text-zinc-500">{r.note ?? "—"}</TableCell>
                  <TableCell className="text-xs">
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5",
                        r.is_active ? "bg-emerald-500/15 text-emerald-300" : "bg-zinc-800 text-zinc-500",
                      )}
                    >
                      {r.is_active ? "Active" : "Inactive"}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button type="button" variant="ghost" size="icon" onClick={() => openEdit(r)} title="Edit">
                        <Pencil className="size-4 text-zinc-400" />
                      </Button>
                      {r.is_active ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => void deactivate(r.id)}
                          title="Deactivate"
                        >
                          <UserMinus className="size-4 text-zinc-400" />
                        </Button>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="border-zinc-800 bg-zinc-950 text-zinc-100 sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit internal contact" : "Add internal contact"}</DialogTitle>
            <DialogDescription className="text-zinc-500">
              At least one identifier is required. Email is normalized to lowercase.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-1.5">
              <Label htmlFor="ip-email">Email</Label>
              <Input
                id="ip-email"
                className={fieldClass}
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="name@agency.com"
                autoComplete="off"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="ip-bcid">Basecamp person id</Label>
              <Input
                id="ip-bcid"
                className={fieldClass}
                value={form.basecamp_id}
                onChange={(e) => setForm((f) => ({ ...f, basecamp_id: e.target.value }))}
                placeholder="149087659"
                autoComplete="off"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="ip-name">Display name</Label>
              <Input
                id="ip-name"
                className={fieldClass}
                value={form.display_name}
                onChange={(e) => setForm((f) => ({ ...f, display_name: e.target.value }))}
                placeholder="Match Basecamp last_updater.name"
                autoComplete="off"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="ip-note">Note</Label>
              <Textarea
                id="ip-note"
                className={cn(fieldClass, "min-h-[72px]")}
                value={form.note}
                onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                placeholder="Optional"
              />
            </div>
            <div className="flex items-center gap-2 pt-1">
              <Switch
                id="ip-active"
                checked={form.is_active}
                onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: v }))}
              />
              <Label htmlFor="ip-active" className="text-sm text-zinc-400">
                Active
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} className="border-zinc-700">
              Cancel
            </Button>
            <Button type="button" disabled={saving} onClick={() => void saveDialog()}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
