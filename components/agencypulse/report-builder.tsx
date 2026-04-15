"use client";

import { GripVertical, Loader2, Sparkles } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ReportBlock } from "@/types/database.types";

type Props = {
  clientId: string;
  businessName: string;
  initialPeriodStart: string;
  initialPeriodEnd: string;
  initialBlocks: ReportBlock[];
};

export function ReportBuilder({ clientId, businessName, initialPeriodStart, initialPeriodEnd, initialBlocks }: Props) {
  const [periodStart, setPeriodStart] = useState(initialPeriodStart);
  const [periodEnd, setPeriodEnd] = useState(initialPeriodEnd);
  const [notes, setNotes] = useState("");
  const [blocks, setBlocks] = useState<ReportBlock[]>(initialBlocks);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedPublicId, setSavedPublicId] = useState<string | null>(null);

  const canSave = useMemo(() => periodStart <= periodEnd && blocks.length > 0, [periodStart, periodEnd, blocks.length]);

  const onDropAt = (toIdx: number) => {
    if (dragIdx == null || dragIdx === toIdx) return;
    setBlocks((prev) => {
      const next = [...prev];
      const [moved] = next.splice(dragIdx, 1);
      next.splice(toIdx, 0, moved);
      return next;
    });
    setDragIdx(null);
  };

  const rewrite = async (id: string) => {
    const b = blocks.find((x) => x.id === id);
    if (!b) return;
    setBusyId(id);
    try {
      const res = await fetch("/api/reports/ai-rewrite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ block_title: b.title, block_content: b.content, business_name: businessName }),
      });
      const data = (await res.json()) as { rewritten?: string; error?: string };
      if (!res.ok || !data.rewritten) throw new Error(data.error ?? "AI rewrite failed.");
      setBlocks((prev) => prev.map((x) => (x.id === id ? { ...x, content: data.rewritten! } : x)));
      toast.success(`Rewrote ${b.title}.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Rewrite failed.");
    } finally {
      setBusyId(null);
    }
  };

  const save = async (status: "draft" | "published") => {
    if (!canSave) return;
    setSaving(true);
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: clientId,
          period_start: periodStart,
          period_end: periodEnd,
          blocks,
          strategist_notes: notes,
          status,
        }),
      });
      const data = (await res.json()) as { report?: { public_id?: string }; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not save report.");
      setSavedPublicId(data.report?.public_id ?? null);
      toast.success(status === "published" ? "Report published." : "Draft saved.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/90 p-4">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-50">New report · {businessName}</h1>
        <p className="mt-1 text-sm text-zinc-500">Drag blocks to reorder, rewrite with AI, then save draft or publish.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-zinc-500">
            Period start
            <Input className="mt-1 border-zinc-700 bg-zinc-950" type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
          </label>
          <label className="text-xs text-zinc-500">
            Period end
            <Input className="mt-1 border-zinc-700 bg-zinc-950" type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
          </label>
        </div>
      </div>

      <div className="space-y-3">
        {blocks.map((b, idx) => (
          <div
            key={b.id}
            draggable
            onDragStart={() => setDragIdx(idx)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => onDropAt(idx)}
            className="rounded-xl border border-zinc-800 bg-zinc-900/80 p-4"
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <GripVertical className="size-4 text-zinc-500" />
                <h2 className="text-sm font-semibold text-zinc-100">{b.title}</h2>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="border-zinc-600 text-xs"
                disabled={busyId === b.id}
                onClick={() => void rewrite(b.id)}
              >
                {busyId === b.id ? <Loader2 className="mr-1 size-3 animate-spin" /> : <Sparkles className="mr-1 size-3" />}
                AI Rewrite
              </Button>
            </div>
            <Textarea
              rows={8}
              className="border-zinc-700 bg-zinc-950 text-sm"
              value={b.content}
              onChange={(e) => setBlocks((prev) => prev.map((x) => (x.id === b.id ? { ...x, content: e.target.value } : x)))}
            />
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/80 p-4">
        <label className="text-xs text-zinc-500">
          Strategist notes
          <Textarea className="mt-1 border-zinc-700 bg-zinc-950" rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" className="border-zinc-600" disabled={!canSave || saving} onClick={() => void save("draft")}>
            Save draft
          </Button>
          <Button type="button" className="bg-sky-600 text-white hover:bg-sky-500" disabled={!canSave || saving} onClick={() => void save("published")}>
            Publish
          </Button>
          {savedPublicId ? (
            <Link href={`/reports/${savedPublicId}`} className="text-xs text-sky-300 hover:text-sky-200 hover:underline" target="_blank">
              Open public report
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}
