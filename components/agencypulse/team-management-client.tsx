"use client";

import { CloudDownload, Loader2, Pencil, Plus, UserMinus } from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";

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
import type { StaffRow } from "@/lib/staff/staff-types";
import { cn } from "@/lib/utils";

const fieldClass = "border-zinc-700 bg-zinc-950/80 text-zinc-100 placeholder:text-zinc-600";

type FormState = {
  full_name: string;
  email: string;
  basecamp_id: string;
  basecamp_name_handle: string;
  writing_style_notes: string;
  is_active: boolean;
};

const emptyForm: FormState = {
  full_name: "",
  email: "",
  basecamp_id: "",
  basecamp_name_handle: "",
  writing_style_notes: "",
  is_active: true,
};

function formFromRow(r: StaffRow): FormState {
  return {
    full_name: r.full_name ?? "",
    email: r.email ?? "",
    basecamp_id: r.basecamp_id ?? "",
    basecamp_name_handle: r.basecamp_name_handle ?? "",
    writing_style_notes: r.writing_style_notes ?? "",
    is_active: r.is_active,
  };
}

type Props = {
  initialStaff: StaffRow[];
};

export function TeamManagementClient({ initialStaff }: Props) {
  const [rows, setRows] = useState<StaffRow[]>(initialStaff);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [syncBusy, setSyncBusy] = useState(false);
  const [showInactive, setShowInactive] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/staff");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not load team.");
      setRows((data.staff as StaffRow[]) ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed.");
    } finally {
      setLoading(false);
    }
  }, []);

  const syncFromBasecamp = useCallback(async () => {
    setSyncBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/staff/sync", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "Basecamp sync failed.");
      }
      const upserted = Number(data.upserted) || 0;
      const skippedNoEmail = Number(data.skippedNoEmail) || 0;
      const skippedFilter = Number(data.skippedFilter) || 0;
      const setInactive = Number(data.setInactive) || 0;
      const setActive = Number(data.setActive) || 0;
      const parts = [
        `Upserted ${upserted} from Basecamp`,
        setInactive ? `set ${setInactive} inactive` : null,
        setActive ? `reactivated ${setActive}` : null,
        skippedNoEmail || skippedFilter
          ? `skipped ${skippedNoEmail} without email, ${skippedFilter} not on allowlist`
          : null,
      ].filter(Boolean);
      toast.success(parts.join(" · ") + ".");
      await refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Sync failed.";
      setError(msg);
      toast.error(msg);
    } finally {
      setSyncBusy(false);
    }
  }, [refresh]);

  const visibleRows = showInactive ? rows : rows.filter((r) => r.is_active);

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setDialogOpen(true);
    setError(null);
  }

  function openEdit(r: StaffRow) {
    setEditingId(r.id);
    setForm(formFromRow(r));
    setDialogOpen(true);
    setError(null);
  }

  async function saveDialog() {
    setSaving(true);
    setError(null);
    try {
      if (editingId) {
        const res = await fetch(`/api/staff/${editingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            full_name: form.full_name,
            email: form.email,
            basecamp_id: form.basecamp_id.trim() || null,
            basecamp_name_handle: form.basecamp_name_handle.trim() || null,
            writing_style_notes: form.writing_style_notes.trim() || null,
            is_active: form.is_active,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Save failed.");
        const next = data.staff as StaffRow;
        setRows((prev) => prev.map((x) => (x.id === next.id ? next : x)));
      } else {
        const res = await fetch("/api/staff", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            full_name: form.full_name,
            email: form.email,
            basecamp_id: form.basecamp_id.trim() || null,
            basecamp_name_handle: form.basecamp_name_handle.trim() || null,
            writing_style_notes: form.writing_style_notes.trim() || null,
            is_active: form.is_active,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Create failed.");
        const next = data.staff as StaffRow;
        setRows((prev) => [...prev, next].sort((a, b) => a.full_name.localeCompare(b.full_name)));
      }
      setDialogOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  async function deactivate(id: string) {
    if (!confirm("Deactivate this team member? They will no longer match Basecamp sync; client assignments stay.")) {
      return;
    }
    setError(null);
    try {
      const res = await fetch(`/api/staff/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Deactivate failed.");
      const next = data.staff as StaffRow;
      setRows((prev) => prev.map((x) => (x.id === next.id ? next : x)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Deactivate failed.");
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-50">Team & voice</h1>
          <p className="text-zinc-500 mt-1 max-w-2xl text-sm">
            Staff records drive Basecamp “agency vs client” matching during communication sync (email, Basecamp person
            id, and display name). Writing style notes are injected into Gemini when generating strategy insights for
            clients who have a primary strategist. Sync from Basecamp only keeps people active if they posted on a
            mapped project message board (or appear in recent communication snapshots) within 90 days, or have a
            recent directory timestamp when Basecamp provides it.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            className="border-zinc-600 bg-transparent text-zinc-100"
            disabled={loading || syncBusy}
            onClick={() => void refresh()}
          >
            {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            Refresh
          </Button>
          <Button
            type="button"
            variant="outline"
            className="border-zinc-600 bg-transparent text-zinc-100"
            disabled={syncBusy || loading}
            onClick={() => void syncFromBasecamp()}
          >
            {syncBusy ? (
              <Loader2 className="mr-2 size-4 shrink-0 animate-spin" aria-hidden />
            ) : (
              <CloudDownload className="mr-2 size-4 shrink-0" aria-hidden />
            )}
            Sync from Basecamp
          </Button>
          <Button
            type="button"
            className="bg-gradient-to-r from-violet-600 to-sky-600 text-white hover:opacity-95"
            onClick={openCreate}
          >
            <Plus className="mr-2 size-4" aria-hidden />
            Add member
          </Button>
        </div>
      </div>

      {error && !dialogOpen ? <p className="text-red-400 text-sm">{error}</p> : null}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-900/60 px-4 py-3">
        <div className="flex items-center gap-3">
          <Switch
            id="show-inactive-staff"
            checked={showInactive}
            onCheckedChange={(v) => setShowInactive(Boolean(v))}
          />
          <Label htmlFor="show-inactive-staff" className="cursor-pointer text-sm text-zinc-300">
            Show inactive
          </Label>
        </div>
        <p className="text-zinc-500 max-w-xl text-xs leading-snug">
          {showInactive ? `Showing all ${rows.length}.` : `Showing ${visibleRows.length} active (${rows.length - visibleRows.length} hidden).`}{" "}
          Sync allowlist: <code className="text-zinc-400">@beyondindigo.com</code> plus{" "}
          <code className="text-zinc-400">STAFF_SYNC_GMAIL_WHITELIST</code> for Gmail.
        </p>
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/90 shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="border-zinc-800 hover:bg-transparent">
              <TableHead className="text-zinc-400">Name</TableHead>
              <TableHead className="text-zinc-400">Email</TableHead>
              <TableHead className="text-zinc-400">Basecamp</TableHead>
              <TableHead className="text-zinc-400">Active</TableHead>
              <TableHead className="text-right text-zinc-400">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow className="border-zinc-800">
                <TableCell colSpan={5} className="text-zinc-500 py-10 text-center text-sm">
                  No staff yet. Add your team so communication sync can classify internal authors. Legacy{" "}
                  <code className="text-zinc-400">AGENCY_TEAM_*</code> env vars still apply when this list is empty.
                </TableCell>
              </TableRow>
            ) : visibleRows.length === 0 ? (
              <TableRow className="border-zinc-800">
                <TableCell colSpan={5} className="text-zinc-500 py-10 text-center text-sm">
                  No active staff. Turn on <span className="font-medium text-zinc-400">Show inactive</span> to review
                  soft-deactivated members (writing style notes are kept).
                </TableCell>
              </TableRow>
            ) : (
              visibleRows.map((r) => (
                <TableRow key={r.id} className="border-zinc-800">
                  <TableCell className="font-medium text-zinc-100">{r.full_name}</TableCell>
                  <TableCell className="text-zinc-400 text-sm">{r.email}</TableCell>
                  <TableCell className="text-zinc-500 text-xs font-mono">
                    {(r.basecamp_id ?? "").trim() || "—"}
                    {(r.basecamp_name_handle ?? "").trim() ? (
                      <span className="text-zinc-400"> · {r.basecamp_name_handle}</span>
                    ) : null}
                  </TableCell>
                  <TableCell>{r.is_active ? "Yes" : "No"}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="text-zinc-300 hover:text-white"
                      onClick={() => openEdit(r)}
                    >
                      <Pencil className="size-4" aria-hidden />
                    </Button>
                    {r.is_active ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="text-amber-400 hover:text-amber-200"
                        onClick={() => void deactivate(r.id)}
                      >
                        <UserMinus className="size-4" aria-hidden />
                      </Button>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto border-zinc-800 bg-zinc-950 text-zinc-100 sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit team member" : "Add team member"}</DialogTitle>
            <DialogDescription className="text-zinc-500">
              Match Basecamp&apos;s <span className="font-mono text-zinc-400">last_updater.id</span> and display name
              when email is missing from the API.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="tm-name" className="text-zinc-400">
                Full name
              </Label>
              <Input
                id="tm-name"
                className={fieldClass}
                value={form.full_name}
                onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="tm-email" className="text-zinc-400">
                Email
              </Label>
              <Input
                id="tm-email"
                type="email"
                className={fieldClass}
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              />
            </div>
            <div className="grid gap-2 sm:grid-cols-2 sm:gap-3">
              <div className="grid gap-2">
                <Label htmlFor="tm-bcid" className="text-zinc-400">
                  Basecamp person id
                </Label>
                <Input
                  id="tm-bcid"
                  className={fieldClass}
                  placeholder="149087659"
                  value={form.basecamp_id}
                  onChange={(e) => setForm((f) => ({ ...f, basecamp_id: e.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="tm-bcn" className="text-zinc-400">
                  Basecamp display name
                </Label>
                <Input
                  id="tm-bcn"
                  className={fieldClass}
                  placeholder="Alex Smith"
                  value={form.basecamp_name_handle}
                  onChange={(e) => setForm((f) => ({ ...f, basecamp_name_handle: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="tm-voice" className="text-zinc-400">
                Writing style / voice profile
              </Label>
              <Textarea
                id="tm-voice"
                className={cn(fieldClass, "min-h-[120px]")}
                placeholder="Warm, concise; uses short paragraphs; signs off with first name only…"
                value={form.writing_style_notes}
                onChange={(e) => setForm((f) => ({ ...f, writing_style_notes: e.target.value }))}
              />
            </div>
            <div className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2">
              <span className="text-sm text-zinc-300">Active</span>
              <Switch checked={form.is_active} onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: Boolean(v) }))} />
            </div>
            {error ? <p className="text-red-400 text-sm">{error}</p> : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" className="border-zinc-600" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={saving || !form.full_name.trim() || !form.email.trim()}
              className="bg-sky-600 text-white hover:bg-sky-500"
              onClick={() => void saveDialog()}
            >
              {saving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
